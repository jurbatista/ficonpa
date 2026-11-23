import type { Locator as PwLocator } from "playwright";
import { BrowserSession, LinkGoneError, UnavailableError, CaptchaError, type CapturedPdf, type ElementInfo } from "./browser";
import { isPdfBuffer, safeFetch } from "./net-guard";
import { isVariableSegment, renderTemplate, templatizeUrl, type UrlVars } from "./pattern";
import type { ElementLocator, RecipeStep } from "./steps";

/**
 * "Script interno" de uma receita: uma lista DECLARATIVA de passos. Nunca é código
 * gerado pela LLM — só dados que o executor abaixo interpreta. Assim uma página
 * maliciosa não consegue fazer o sistema executar nada além de navegar e clicar.
 */

export type { ElementLocator, RecipeStep } from "./steps";
export { describeSteps } from "./steps";

export class StepFailedError extends Error {}

function stableToken(value: string | null | undefined): string | null {
  if (!value) return null;
  return isVariableSegment(value) || /\d{4,}/.test(value) ? null : value;
}

/** Constrói um localizador resistente a mudanças de id/valores a partir de um elemento observado. */
export function buildLocator(element: ElementInfo): ElementLocator {
  const locator: ElementLocator = { tag: element.tag };
  const id = stableToken(element.id);
  const name = stableToken(element.name);
  if (id && /^[A-Za-z][\w-]*$/.test(id)) locator.css = `#${id}`;
  else if (name && /^[\w-]+$/.test(name)) locator.css = `${element.tag}[name="${name}"]`;

  const text = (element.text || element.ariaLabel || element.title || "").trim();
  if (text && text.length <= 60 && !/\d{4,}/.test(text)) locator.text = text;

  if (element.href) {
    try {
      const url = new URL(element.href);
      const fixed = url.pathname
        .split("/")
        .filter(Boolean)
        .filter((segment) => !isVariableSegment(segment));
      if (fixed.length > 0) locator.hrefContains = `/${fixed.join("/")}/`.replace(/\/+$/, "/");
    } catch {
      // href javascript:, mailto: etc.
    }
  }
  return locator;
}

async function findInFrames(session: BrowserSession, target: ElementLocator): Promise<PwLocator | null> {
  const strategies: Array<(frame: ReturnType<BrowserSession["page"]["mainFrame"]>) => PwLocator> = [];
  if (target.css) strategies.push((frame) => frame.locator(target.css!));
  if (target.text) {
    const text = target.text;
    strategies.push((frame) =>
      frame
        .locator(
          'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], [onclick], [download]',
        )
        .filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") }),
    );
    strategies.push((frame) => frame.getByText(text, { exact: true }));
  }
  if (target.hrefContains) strategies.push((frame) => frame.locator(`a[href*="${target.hrefContains}"]`));

  for (const strategy of strategies) {
    for (const frame of session.page.frames()) {
      const locator = strategy(frame);
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < Math.min(count, 5); index += 1) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) return candidate;
      }
    }
  }
  return null;
}

export type RunResult = {
  pdf: CapturedPdf;
  trace: string[];
};

/** Executa uma receita do zero. Lança CaptchaError / UnavailableError / LinkGoneError / StepFailedError. */
export async function runRecipe(steps: RecipeStep[], vars: UrlVars): Promise<RunResult> {
  const trace: string[] = [];

  // Atalho: receita "fetchPdf" pura não precisa abrir navegador.
  if (steps.length === 1 && steps[0].op === "fetchPdf") {
    const url = renderTemplate(steps[0].url, vars);
    trace.push(`fetchPdf ${url}`);
    let result;
    try {
      result = await safeFetch(url);
    } catch (error) {
      throw new UnavailableError(`Falha ao baixar ${url}: ${error instanceof Error ? error.message : error}`);
    }
    if (result.status >= 500) throw new UnavailableError(`Site respondeu ${result.status}.`);
    if (result.status === 404 || result.status === 410) throw new LinkGoneError(`PDF não existe mais (${result.status}).`);
    if (!isPdfBuffer(result.body)) {
      throw new StepFailedError(`O endereço ${url} não devolveu um PDF (status ${result.status}, ${result.contentType}).`);
    }
    return { pdf: { url: result.finalUrl, buffer: result.body, via: "response" }, trace };
  }

  const session = await BrowserSession.open();
  try {
    for (const [index, step] of steps.entries()) {
      const label = `passo ${index + 1} (${step.op})`;
      if (step.op === "goto" || step.op === "fetchPdf") {
        const url = renderTemplate(step.url, vars);
        trace.push(`${step.op} ${url}`);
        await session.goto(url);
      } else if (step.op === "click") {
        const locator = await findInFrames(session, step.target);
        if (!locator) {
          if (await session.detectCaptcha()) throw new CaptchaError("A página pediu captcha.");
          throw new StepFailedError(`${label}: elemento não encontrado ${JSON.stringify(step.target)}.`);
        }
        trace.push(`click ${JSON.stringify(step.target)}`);
        await locator.scrollIntoViewIfNeeded().catch(() => undefined);
        await locator.click({ timeout: 10_000 }).catch((error: unknown) => {
          throw new StepFailedError(`${label}: falha ao clicar (${error instanceof Error ? error.message.slice(0, 150) : error}).`);
        });
        await session.settle();
      } else if (step.op === "wait") {
        trace.push(`wait ${step.ms}`);
        await session.page.waitForTimeout(Math.min(step.ms, 10_000));
        await session.settle(200);
      }
    }
    await session.settle(1000);

    const pdf = session.pdfs[session.pdfs.length - 1];
    if (!pdf) {
      if (await session.detectCaptcha()) throw new CaptchaError("A página pediu captcha.");
      throw new StepFailedError("A receita terminou sem baixar nenhum PDF.");
    }
    return { pdf, trace };
  } finally {
    await session.close();
  }
}

/**
 * Transforma o caminho gravado pelo agente em receitas candidatas, da mais
 * rápida para a mais robusta:
 *   1) fetchPdf direto, quando a URL do PDF pode ser montada a partir do link;
 *   2) a navegação completa (goto + cliques) gravada.
 */
export function candidateRecipes(input: {
  recorded: RecipeStep[];
  pdfUrl: string;
  vars: UrlVars;
}): RecipeStep[][] {
  const candidates: RecipeStep[][] = [];
  if (/^https:/i.test(input.pdfUrl)) {
    const template = templatizeUrl(input.pdfUrl, input.vars);
    if (template) candidates.push([{ op: "fetchPdf", url: template }]);
  }
  candidates.push([{ op: "goto", url: "{{url}}" }, ...input.recorded]);
  return candidates;
}
