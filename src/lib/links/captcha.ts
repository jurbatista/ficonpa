import type { Frame, Page } from "playwright";
import { optionalEnv } from "@/lib/env";

/**
 * Captcha nas páginas de boleto: acha o desafio, pede a resposta ao 2Captcha
 * (chave em TWOCAPTCHA_API_KEY) e entrega a resposta à página.
 *
 * Tipos atendidos: reCAPTCHA v2 (inclusive invisível e Enterprise) e Cloudflare
 * Turnstile. Sem a chave, ou com outro tipo de captcha, o link continua
 * esperando uma pessoa, como antes.
 */

export class CaptchaSolverError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type CaptchaKind = "recaptcha-v2" | "recaptcha-v2-enterprise" | "turnstile";

export type CaptchaChallenge = {
  kind: CaptchaKind;
  siteKey: string;
  /** Origem da página onde o widget está (é o que identifica o site para o captcha). */
  origin: string;
  invisible: boolean;
  /** reCAPTCHA servido por recaptcha.net em vez de google.com. */
  apiDomain?: string;
  /** Frame onde o widget foi montado: é nele que a resposta é entregue. */
  host: Frame;
};

const API = "https://api.2captcha.com";
const POLL_MS = 5000;
const SOLVE_TIMEOUT_MS = 150_000;

function apiKey(): string | undefined {
  return optionalEnv("TWOCAPTCHA_API_KEY");
}

export function captchaSolverEnabled(): boolean {
  return Boolean(apiKey());
}

/** Identifica um desafio já resolvido nesta sessão (o widget continua na tela depois da resposta). */
export function challengeKey(challenge: CaptchaChallenge): string {
  return `${challenge.kind}:${challenge.siteKey}:${challenge.origin}`;
}

/** O script do Turnstile, como os sites o carregam. */
export function isTurnstileApi(url: URL): boolean {
  return url.hostname === "challenges.cloudflare.com" && /\/turnstile\/v0\/api\.js$/.test(url.pathname);
}

/**
 * Acrescentado ao fim do script do Turnstile: guarda o retorno que o site passa a
 * turnstile.render(), para a resposta poder ser entregue depois. Não dá para vigiar
 * `window.turnstile` antes de o script carregar: ele confere `"turnstile" in window`
 * e desiste achando que já foi carregado.
 */
export const TURNSTILE_RENDER_HOOK = `;(() => {
  try {
    const api = window.turnstile;
    if (!api || api.__fcWrapped || typeof api.render !== "function") return;
    const store = (window.__fcCaptcha = window.__fcCaptcha || { turnstile: [] });
    const render = api.render.bind(api);
    api.render = (container, params) => {
      try {
        store.turnstile.push({ sitekey: params && params.sitekey, callback: params && params.callback });
      } catch (error) {}
      return render(container, params);
    };
    api.__fcWrapped = true;
  } catch (error) {}
})();`;

function originOf(frame: Frame): string | null {
  try {
    const url = new URL(frame.url());
    return /^https?:$/.test(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

function fromFrameUrl(frame: Frame, page: Page): CaptchaChallenge | null {
  let url: URL;
  try {
    url = new URL(frame.url());
  } catch {
    return null;
  }
  const host = frame.parentFrame() ?? page.mainFrame();
  const origin = originOf(host);
  if (!origin) return null;

  const recaptcha = url.pathname.match(/\/recaptcha\/(api2|enterprise)\/(anchor|bframe)/);
  if (recaptcha && /(^|\.)google\.com$|(^|\.)recaptcha\.net$/.test(url.hostname)) {
    const siteKey = url.searchParams.get("k");
    if (!siteKey) return null;
    return {
      kind: recaptcha[1] === "enterprise" ? "recaptcha-v2-enterprise" : "recaptcha-v2",
      siteKey,
      origin,
      invisible: url.searchParams.get("size") === "invisible",
      apiDomain: /recaptcha\.net$/.test(url.hostname) ? "recaptcha.net" : undefined,
      host,
    };
  }

  if (url.hostname === "challenges.cloudflare.com" && /turnstile/.test(url.pathname)) {
    const siteKey = url.pathname.split("/").find((segment) => /^[0-3]x[A-Za-z0-9_-]{16,}$/.test(segment));
    if (!siteKey) return null;
    return { kind: "turnstile", siteKey, origin, invisible: false, host };
  }
  return null;
}

async function fromDom(frame: Frame): Promise<CaptchaChallenge | null> {
  const origin = originOf(frame);
  if (!origin) return null;
  const found = await frame
    .evaluate(() => {
      const element = document.querySelector<HTMLElement>(
        ".cf-turnstile[data-sitekey], .g-recaptcha[data-sitekey]",
      );
      if (!element) return null;
      return {
        turnstile: element.classList.contains("cf-turnstile"),
        siteKey: element.getAttribute("data-sitekey") ?? "",
        invisible: element.getAttribute("data-size") === "invisible",
      };
    })
    .catch(() => null);
  if (!found?.siteKey) return null;
  return {
    kind: found.turnstile ? "turnstile" : "recaptcha-v2",
    siteKey: found.siteKey,
    origin,
    invisible: found.invisible,
    host: frame,
  };
}

/** Procura na página um captcha que dê para resolver. O visível vem antes do invisível. */
export async function findCaptcha(page: Page): Promise<CaptchaChallenge | null> {
  const found: CaptchaChallenge[] = [];
  for (const frame of page.frames()) {
    const challenge = fromFrameUrl(frame, page);
    if (!challenge) continue;
    // O reCAPTCHA usa dois frames (a caixa e o desafio); só o da caixa diz se é invisível.
    const same = found.find((item) => challengeKey(item) === challengeKey(challenge));
    if (same) same.invisible = same.invisible || challenge.invisible;
    else found.push(challenge);
  }
  if (found.length === 0) {
    for (const frame of page.frames()) {
      const challenge = await fromDom(frame);
      if (challenge) found.push(challenge);
    }
  }
  return found.find((item) => !item.invisible) ?? found[0] ?? null;
}

type ApiResponse = {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  taskId?: number;
  status?: "processing" | "ready";
  solution?: { token?: string; gRecaptchaResponse?: string };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method: "createTask" | "getTaskResult", body: Record<string, unknown>): Promise<ApiResponse> {
  let lastError = "";
  // A documentação pede para repetir quando a resposta não é 200.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(3000);
    try {
      const response = await fetch(`${API}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      return (await response.json()) as ApiResponse;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new CaptchaSolverError("UNREACHABLE", `Serviço de captcha fora do ar (${lastError}).`);
}

function failure(response: ApiResponse): CaptchaSolverError {
  const code = response.errorCode ?? `ERROR_${response.errorId}`;
  return new CaptchaSolverError(code, `${code}: ${response.errorDescription ?? "sem detalhe"}`);
}

async function requestToken(key: string, challenge: CaptchaChallenge, userAgent?: string): Promise<string> {
  // Só a origem vai para o serviço: é ela que o captcha confere. O link da cobrança não sai daqui.
  const websiteURL = `${challenge.origin}/`;
  const task: Record<string, unknown> =
    challenge.kind === "turnstile"
      ? { type: "TurnstileTaskProxyless", websiteURL, websiteKey: challenge.siteKey }
      : {
          type:
            challenge.kind === "recaptcha-v2-enterprise"
              ? "RecaptchaV2EnterpriseTaskProxyless"
              : "RecaptchaV2TaskProxyless",
          websiteURL,
          websiteKey: challenge.siteKey,
          isInvisible: challenge.invisible,
          ...(userAgent ? { userAgent } : {}),
          ...(challenge.apiDomain ? { apiDomain: challenge.apiDomain } : {}),
        };

  let created = await call("createTask", { clientKey: key, task });
  // Fila cheia do lado deles: espera e tenta de novo.
  for (let retry = 0; created.errorId !== 0 && created.errorCode === "ERROR_NO_SLOT_AVAILABLE" && retry < 3; retry += 1) {
    await sleep(POLL_MS);
    created = await call("createTask", { clientKey: key, task });
  }
  if (created.errorId !== 0 || !created.taskId) throw failure(created);

  const deadline = Date.now() + SOLVE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const result = await call("getTaskResult", { clientKey: key, taskId: created.taskId });
    if (result.errorId !== 0) throw failure(result);
    if (result.status !== "ready") continue;
    const token = result.solution?.token ?? result.solution?.gRecaptchaResponse;
    if (!token) throw new CaptchaSolverError("EMPTY", "O serviço de captcha respondeu sem a resposta.");
    return token;
  }
  throw new CaptchaSolverError("TIMEOUT", "O serviço de captcha demorou demais.");
}

/** Pede a resposta do desafio. Um desafio que ninguém conseguiu resolver é tentado mais uma vez. */
export async function solveChallenge(challenge: CaptchaChallenge, userAgent?: string): Promise<string> {
  const key = apiKey();
  if (!key) throw new CaptchaSolverError("NOT_CONFIGURED", "Serviço de captcha não configurado.");
  try {
    return await requestToken(key, challenge, userAgent);
  } catch (error) {
    if (error instanceof CaptchaSolverError && error.code === "ERROR_CAPTCHA_UNSOLVABLE") {
      return requestToken(key, challenge, userAgent);
    }
    throw error;
  }
}

export type AppliedToken = { fields: number; callbacks: number };

/**
 * Entrega a resposta à página: preenche o campo que o formulário envia e chama o
 * retorno que o site registrou ao montar o widget.
 */
export async function applyToken(challenge: CaptchaChallenge, token: string): Promise<AppliedToken> {
  return challenge.host.evaluate(
    ({ value, turnstile }) => {
      const scope = window as unknown as Record<string, unknown>;
      const callbacks = new Set<(token: string) => void>();
      const addCallback = (candidate: unknown) => {
        const fn = typeof candidate === "string" ? scope[candidate] : candidate;
        if (typeof fn === "function") callbacks.add(fn as (token: string) => void);
      };

      const selector = turnstile
        ? 'input[name="cf-turnstile-response"], input[name="g-recaptcha-response"], textarea[name="g-recaptcha-response"]'
        : 'textarea[name="g-recaptcha-response"], textarea.g-recaptcha-response, #g-recaptcha-response';
      const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector));
      for (const field of fields) {
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // Retorno declarado no HTML.
      for (const element of Array.from(document.querySelectorAll("[data-sitekey][data-callback]"))) {
        addCallback(element.getAttribute("data-callback"));
      }

      if (turnstile) {
        // Retorno passado a turnstile.render(), guardado pelo script inicial.
        const store = scope.__fcCaptcha as { turnstile?: { callback?: unknown }[] } | undefined;
        for (const item of store?.turnstile ?? []) addCallback(item.callback);
      } else {
        // Retorno passado a grecaptcha.render(): fica dentro da configuração do widget.
        const visit = (node: unknown, depth: number) => {
          if (!node || typeof node !== "object" || depth > 5 || node instanceof Node || node === window) return;
          for (const key of Object.keys(node as object)) {
            let child: unknown;
            try {
              child = (node as Record<string, unknown>)[key];
            } catch {
              continue;
            }
            if (key === "callback") addCallback(child);
            else visit(child, depth + 1);
          }
        };
        try {
          visit((scope.___grecaptcha_cfg as { clients?: unknown } | undefined)?.clients, 0);
        } catch {
          // configuração ausente ou inacessível: o campo preenchido basta para formulários comuns
        }
      }

      for (const callback of callbacks) {
        try {
          callback(value);
        } catch {
          // erro do próprio site ao tratar a resposta
        }
      }
      return { fields: fields.length, callbacks: callbacks.size };
    },
    { value: token, turnstile: challenge.kind === "turnstile" },
  );
}

export const SOLVER_KEY_REFUSED = "A chave do serviço que resolve a confirmação do site não foi aceita.";
export const SOLVER_NO_BALANCE = "O serviço que resolve a confirmação do site está sem saldo.";

/** Frase para a tela quando o serviço não resolveu; o código técnico fica só no registro. */
export function solverFailureReason(error: CaptchaSolverError): string {
  if (error.code === "ERROR_KEY_DOES_NOT_EXIST") return SOLVER_KEY_REFUSED;
  if (error.code === "ERROR_ZERO_BALANCE") return SOLVER_NO_BALANCE;
  return "A confirmação do site não pôde ser resolvida.";
}
