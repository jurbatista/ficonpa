import type { Browser, BrowserContext, Frame, Page, Response } from "playwright";
import {
  applyToken,
  captchaSolverEnabled,
  CaptchaSolverError,
  challengeKey,
  findCaptcha,
  isTurnstileApi,
  solveChallenge,
  solverFailureReason,
  TURNSTILE_RENDER_HOOK,
} from "./captcha";
import { assertSafeUrl, isPdfBuffer, isPublicHost } from "./net-guard";

/**
 * Sessão de navegador headless usada tanto pelo agente que aprende o caminho
 * quanto pela execução das receitas já aprendidas.
 */

export class CaptchaError extends Error {}
export class UnavailableError extends Error {}
export class LinkGoneError extends Error {}

export type CapturedPdf = {
  url: string;
  buffer: Buffer;
  via: "response" | "download";
};

export type ElementInfo = {
  ref: number;
  frame: number;
  tag: string;
  role: string | null;
  text: string;
  href: string | null;
  id: string | null;
  name: string | null;
  title: string | null;
  ariaLabel: string | null;
  type: string | null;
};

export type PageSnapshot = {
  url: string;
  title: string;
  text: string;
  elements: ElementInfo[];
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/** Uma página não pede mais captchas do que isto numa visita; acima disso algo está errado. */
const MAX_CAPTCHAS_PER_SESSION = 2;

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) return sharedBrowser;
  const { chromium } = await import("playwright");
  sharedBrowser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--disable-dev-shm-usage", "--no-first-run", "--disable-extensions"],
  });
  return sharedBrowser;
}

export async function closeSharedBrowser(): Promise<void> {
  await sharedBrowser?.close().catch(() => undefined);
  sharedBrowser = null;
}

const NETWORK_ERRORS =
  /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT|ERR_ADDRESS_UNREACHABLE|ERR_SSL|ERR_CERT|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|Timeout .* exceeded|ECONNRESET|ENOTFOUND/i;

export function isNetworkError(error: unknown): boolean {
  return NETWORK_ERRORS.test(error instanceof Error ? error.message : String(error));
}

export class BrowserSession {
  readonly pdfs: CapturedPdf[] = [];
  page!: Page;
  private context!: BrowserContext;
  private pending: Promise<unknown>[] = [];
  private solvedCaptchas = new Set<string>();
  private captchaAttempts = 0;

  static async open(): Promise<BrowserSession> {
    const session = new BrowserSession();
    const browser = await getBrowser();
    session.context = await browser.newContext({
      acceptDownloads: true,
      serviceWorkers: "block",
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
    });
    // O tsx/esbuild (usado pelo worker) injeta __name() em funções nomeadas; o código
    // enviado via page.evaluate roda no navegador, onde esse helper não existe.
    await session.context.addInitScript({ content: "globalThis.__name = globalThis.__name || ((fn) => fn);" });
    session.context.setDefaultTimeout(15_000);
    session.context.setDefaultNavigationTimeout(30_000);

    // Bloqueia qualquer requisição para a rede interna (SSRF) e mídia pesada.
    await session.context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
      if (url.protocol !== "https:" && url.protocol !== "http:") return route.abort("blockedbyclient");
      if (["media", "font"].includes(request.resourceType())) return route.abort("blockedbyclient");
      if (!(await isPublicHost(url.hostname))) return route.abort("blockedbyclient");
      if (isTurnstileApi(url) && captchaSolverEnabled()) {
        try {
          const response = await route.fetch();
          return await route.fulfill({ response, body: `${await response.text()}\n${TURNSTILE_RENDER_HOOK}` });
        } catch {
          return route.continue().catch(() => undefined);
        }
      }
      return route.continue();
    });

    session.context.on("response", (response) => session.onResponse(response));
    session.context.on("page", (page) => {
      session.page = page;
      session.attachDownloads(page);
      // Se o popup fechar (comum quando ele só dispara o download), volta para a aba anterior.
      page.on("close", () => {
        const open = session.context.pages().filter((item) => !item.isClosed());
        if (session.page === page && open.length > 0) session.page = open[open.length - 1];
      });
    });

    session.page = await session.context.newPage();
    session.attachDownloads(session.page);
    return session;
  }

  private onResponse(response: Response) {
    const type = (response.headers()["content-type"] ?? "").toLowerCase();
    const looksPdf = type.includes("pdf") || /\.pdf(\?|$)/i.test(response.url());
    if (!looksPdf || response.status() >= 400) return;
    const url = response.url();
    const task = (async () => {
      const buffer = await response.body().catch(() => null);
      if (isPdfBuffer(buffer)) {
        this.addPdf({ url, buffer: buffer!, via: "response" });
        return;
      }
      // Chromium completo abre PDFs no visualizador embutido e o corpo da resposta fica
      // indisponível. Baixa de novo a mesma URL com os cookies desta sessão.
      if (!/^https:/i.test(url)) return;
      try {
        await assertSafeUrl(url);
        const again = await this.context.request.get(url, { timeout: 20_000, maxRedirects: 3 });
        const body = await again.body();
        if (isPdfBuffer(body)) this.addPdf({ url, buffer: body, via: "response" });
      } catch {
        // ignora: outra estratégia (download) pode ter capturado
      }
    })();
    this.pending.push(task);
  }

  private attachDownloads(page: Page) {
    page.on("download", (download) => {
      const task = download
        .createReadStream()
        .then(async (stream) => {
          const chunks: Buffer[] = [];
          for await (const chunk of stream) chunks.push(Buffer.from(chunk));
          const buffer = Buffer.concat(chunks);
          if (isPdfBuffer(buffer)) this.addPdf({ url: download.url(), buffer, via: "download" });
        })
        .catch(() => undefined);
      this.pending.push(task);
    });
  }

  private addPdf(pdf: CapturedPdf) {
    if (!this.pdfs.some((item) => item.buffer.equals(pdf.buffer))) this.pdfs.push(pdf);
  }

  /** Espera a página assentar e os PDFs em trânsito terminarem de baixar. */
  async settle(ms = 1500): Promise<void> {
    await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await this.page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => undefined);
    await this.page.waitForTimeout(ms).catch(() => undefined);
    await Promise.allSettled(this.pending);
  }

  async goto(url: string): Promise<void> {
    let response: Response | null = null;
    try {
      response = await this.page.goto(url, { waitUntil: "domcontentloaded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Navegar direto para um PDF vira download no Chromium headless: não é erro.
      if (/Download is starting|net::ERR_ABORTED/i.test(message)) {
        await this.settle(500);
        if (this.pdfs.length > 0) return;
      }
      if (isNetworkError(error)) throw new UnavailableError(`Site fora do ar: ${message.slice(0, 200)}`);
      throw error;
    }
    if (response) {
      const status = response.status();
      if (status >= 500) throw new UnavailableError(`Site respondeu ${status}.`);
      if (status === 404 || status === 410) throw new LinkGoneError(`Link expirado ou inexistente (${status}).`);
    }
    await this.settle();
  }

  /**
   * Só considera captcha quando há um desafio VISÍVEL bloqueando a página.
   * O selo do reCAPTCHA invisível (comum em páginas de pagamento) não conta.
   */
  async detectCaptcha(): Promise<boolean> {
    const viewport = this.page.viewportSize() ?? { width: 1280, height: 900 };
    for (const frame of this.page.frames()) {
      const url = frame.url();
      if (!/recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha/i.test(url)) continue;
      if (/size=invisible/i.test(url)) continue;
      const element = await frame.frameElement().catch(() => null);
      const box = element ? await element.boundingBox().catch(() => null) : null;
      if (!box || box.width < 50 || box.height < 50) continue;
      // O reCAPTCHA invisível deixa o frame do desafio escondido, fora da tela, até precisar dele.
      const onScreen =
        box.x < viewport.width &&
        box.x + box.width > 0 &&
        box.y < viewport.height * 3 &&
        box.y + box.height > 0;
      if (!onScreen) continue;
      if (!(await element!.isVisible().catch(() => true))) continue;
      const isChallenge = /bframe|\/challenge|hcaptcha\.com\/captcha|challenges\.cloudflare\.com|arkoselabs|funcaptcha/i.test(url);
      // Caixa "não sou um robô" tem ~304x78; o selo invisível tem 256x60.
      const isCheckbox = /anchor/i.test(url) && box.width >= 290;
      if (isChallenge || isCheckbox) return true;
    }
    const title = await this.page.title().catch(() => "");
    const text = await this.page
      .evaluate(() => (document.body?.innerText ?? "").slice(0, 3000))
      .catch(() => "");
    return /just a moment|attention required|checking your browser|não sou um robô|nao sou um robo|i'?m not a robot|verify you are human|confirme que você é humano/i.test(
      `${title}\n${text}`,
    );
  }

  /**
   * Passa pelo captcha da página, quando há um e o serviço que resolve está configurado.
   * Devolve true se resolveu agora; false se não havia nada a resolver (ou já foi resolvido
   * nesta visita — o widget continua na tela depois da resposta). Lança CaptchaError quando
   * o captcha trava a página e não dá para resolver.
   *
   * `expected`: quem chama já sabe que há captcha (passo gravado na receita, ou o
   * próprio sistema de busca desistiu por causa dele), mesmo sem desafio visível.
   */
  async passCaptcha(log: (line: string) => void, options: { expected?: boolean } = {}): Promise<boolean> {
    const visible = await this.detectCaptcha();
    if (!visible && !options.expected) return false;

    const challenge = await findCaptcha(this.page).catch(() => null);
    if (!challenge) {
      if (!visible) return false;
      throw new CaptchaError(
        captchaSolverEnabled()
          ? "A página exige um tipo de captcha que o sistema não resolve."
          : "A página exige captcha.",
      );
    }

    const key = challengeKey(challenge);
    if (this.solvedCaptchas.has(key)) return false;
    if (!captchaSolverEnabled()) throw new CaptchaError("A página exige captcha.");
    if (this.captchaAttempts >= MAX_CAPTCHAS_PER_SESSION) {
      throw new CaptchaError("A página continua pedindo captcha.");
    }
    this.captchaAttempts += 1;

    log(`captcha encontrado (${challenge.kind}${challenge.invisible ? ", invisível" : ""}); resolvendo`);
    const started = Date.now();
    let token: string;
    try {
      token = await solveChallenge(challenge, USER_AGENT);
    } catch (error) {
      if (error instanceof CaptchaSolverError) {
        log(`captcha não resolvido: ${error.message}`);
        throw new CaptchaError(solverFailureReason(error));
      }
      throw error;
    }
    // A resposta leva alguns segundos: a página pode ter recarregado o widget nesse meio-tempo.
    const current = await findCaptcha(this.page).catch(() => null);
    const target = current && challengeKey(current) === key ? current : challenge;
    const applied = await applyToken(target, token).catch(() => ({ fields: 0, callbacks: 0 }));
    this.solvedCaptchas.add(key);
    log(
      `captcha resolvido em ${Math.round((Date.now() - started) / 1000)}s (campos preenchidos: ${applied.fields}, retornos chamados: ${applied.callbacks})`,
    );
    await this.settle(1500);
    return true;
  }

  /** Marca os elementos clicáveis de todos os frames e devolve uma descrição compacta. */
  async snapshot(maxElements = 80): Promise<PageSnapshot> {
    const elements: ElementInfo[] = [];
    const frames = this.page.frames();
    let ref = 0;
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
      const frame = frames[frameIndex];
      const items = await frame
        .evaluate(
          ({ start, frameIndex: fi }) => {
            const selector =
              'a[href], button, [role="button"], [role="link"], input[type="submit"], input[type="button"], [onclick], [download]';
            // Percorre também Shadow DOM (web components), onde muitos sites de cobrança renderizam botões.
            const nodes: HTMLElement[] = [];
            const walk = (root: Document | ShadowRoot) => {
              for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
                if (element.matches(selector)) nodes.push(element);
                if (element.shadowRoot) walk(element.shadowRoot);
              }
            };
            walk(document);
            const out: Array<Record<string, unknown>> = [];
            let index = start;
            for (const node of nodes) {
              const rect = node.getBoundingClientRect();
              const style = window.getComputedStyle(node);
              if (rect.width < 2 || rect.height < 2 || style.visibility === "hidden" || style.display === "none") {
                continue;
              }
              node.setAttribute("data-fc-ref", String(index));
              const text = (node.innerText || (node as HTMLInputElement).value || "").replace(/\s+/g, " ").trim();
              out.push({
                ref: index,
                frame: fi,
                tag: node.tagName.toLowerCase(),
                role: node.getAttribute("role"),
                text: text.slice(0, 100),
                href: node instanceof HTMLAnchorElement ? node.href : null,
                id: node.id || null,
                name: node.getAttribute("name"),
                title: node.getAttribute("title"),
                ariaLabel: node.getAttribute("aria-label"),
                type: node.getAttribute("type"),
              });
              index += 1;
            }
            return out;
          },
          { start: ref, frameIndex },
        )
        .catch(() => [] as Array<Record<string, unknown>>);
      for (const item of items) elements.push(item as unknown as ElementInfo);
      ref += items.length;
    }

    const text = await this.page
      .evaluate(() => {
        const parts: string[] = [];
        const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"]);
        const visit = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
            if (value) parts.push(value);
            return;
          }
          if (!(node instanceof Element) || skip.has(node.tagName.toUpperCase())) return;
          const style = window.getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") return;
          if (node.shadowRoot) node.shadowRoot.childNodes.forEach(visit);
          node.childNodes.forEach(visit);
        };
        if (document.body) visit(document.body);
        return parts.join("\n");
      })
      .catch(() => "");

    return {
      url: this.page.url(),
      title: await this.page.title().catch(() => ""),
      text: text.slice(0, 3500),
      elements: elements.slice(0, maxElements),
    };
  }

  /** Volta: fecha a aba aberta pelo clique (popup) ou retorna no histórico. */
  async back(): Promise<void> {
    const pages = this.context.pages().filter((item) => !item.isClosed());
    if (pages.length > 1 && this.page !== pages[0]) {
      const current = this.page;
      await current.close().catch(() => undefined);
      this.page = this.context.pages().filter((item) => !item.isClosed()).pop() ?? pages[0];
    } else {
      await this.page.goBack().catch(() => undefined);
    }
    await this.settle(500);
  }

  frameOf(element: ElementInfo): Frame {
    return this.page.frames()[element.frame] ?? this.page.mainFrame();
  }

  async clickRef(element: ElementInfo): Promise<void> {
    const handle = this.frameOf(element).locator(`[data-fc-ref="${element.ref}"]`).first();
    await handle.scrollIntoViewIfNeeded().catch(() => undefined);
    await handle.click({ timeout: 10_000 });
    await this.settle();
  }

  async screenshot(): Promise<string | null> {
    try {
      const buffer = await this.page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
      return buffer.toString("base64");
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.pending);
    await this.context?.close().catch(() => undefined);
  }
}
