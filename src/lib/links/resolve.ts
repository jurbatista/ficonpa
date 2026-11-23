import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { linkRecipes, type LinkRecipeRow } from "@/db/schema";
import { learnPath, NeedsHumanError, pdfLooksLikeBoleto } from "./agent";
import { CaptchaError, LinkGoneError, UnavailableError, closeSharedBrowser, type CapturedPdf } from "./browser";
import { isPdfBuffer, safeFetch, BlockedUrlError, HostUnreachableError } from "./net-guard";
import { patternMatches, urlPattern, urlVars, type UrlVars } from "./pattern";
import { candidateRecipes, describeSteps, runRecipe, type RecipeStep } from "./recipe";
import { sha256 } from "@/lib/crypto";

/**
 * Fluxo completo de um link:
 *   1. segue redirecionamentos (links de rastreio) e, se já cair num PDF, pronto;
 *   2. se existir receita aprendida para aquele host + padrão, executa;
 *   3. se não existir ou se ela falhar, o agente aprende o caminho, o sistema
 *      REPETE o caminho gravado do zero para validar e, só então, salva a receita;
 *   4. se a validação falhar, volta ao passo 3 com o erro como contexto, até
 *      `maxAttempts`. Captcha, link expirado e site fora do ar interrompem na hora.
 */

export class ResolveFailedError extends Error {}

export type ResolveMethod = "direct" | "recipe" | "learned" | "relearned";

export type ResolveResult = {
  pdf: CapturedPdf;
  method: ResolveMethod;
  finalUrl: string;
  recipeId: string | null;
  trace: string[];
};

async function findRecipe(finalUrl: string): Promise<LinkRecipeRow | null> {
  const { host } = urlPattern(finalUrl);
  const rows = await getDb()
    .select()
    .from(linkRecipes)
    .where(and(eq(linkRecipes.host, host), eq(linkRecipes.active, true)));
  // Padrão mais específico (mais segmentos fixos) primeiro.
  const matching = rows
    .filter((row) => patternMatches(row.pathPattern, finalUrl))
    .sort((a, b) => b.pathPattern.replace(/\{\}/g, "").length - a.pathPattern.replace(/\{\}/g, "").length);
  return matching[0] ?? null;
}

async function saveRecipe(finalUrl: string, steps: RecipeStep[]): Promise<LinkRecipeRow> {
  const { host, pathPattern } = urlPattern(finalUrl);
  const now = new Date();
  const [row] = await getDb()
    .insert(linkRecipes)
    .values({
      host,
      pathPattern,
      steps: steps as never,
      exampleUrl: finalUrl,
      active: true,
      successCount: 1,
      lastSuccessAt: now,
    })
    .onConflictDoUpdate({
      target: [linkRecipes.host, linkRecipes.pathPattern],
      set: {
        steps: steps as never,
        exampleUrl: finalUrl,
        active: true,
        version: sql`${linkRecipes.version} + 1`,
        successCount: sql`${linkRecipes.successCount} + 1`,
        lastSuccessAt: now,
        lastError: null,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

async function markRecipe(id: string, ok: boolean, error?: string) {
  const now = new Date();
  await getDb()
    .update(linkRecipes)
    .set(
      ok
        ? { successCount: sql`${linkRecipes.successCount} + 1`, lastSuccessAt: now, updatedAt: now }
        : {
            failureCount: sql`${linkRecipes.failureCount} + 1`,
            lastFailureAt: now,
            lastError: error?.slice(0, 1000) ?? null,
            updatedAt: now,
          },
    )
    .where(eq(linkRecipes.id, id));
}

function isFatal(error: unknown): boolean {
  return (
    error instanceof CaptchaError ||
    error instanceof UnavailableError ||
    error instanceof LinkGoneError ||
    error instanceof BlockedUrlError
  );
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 400);
}

/** Dois PDFs representam o mesmo boleto? (mesmo arquivo ou mesma linha digitável) */
async function samePdf(a: CapturedPdf, b: CapturedPdf): Promise<boolean> {
  if (sha256(a.buffer) === sha256(b.buffer)) return true;
  const [checkA, checkB] = await Promise.all([pdfLooksLikeBoleto(a.buffer), pdfLooksLikeBoleto(b.buffer)]);
  if (checkA.linha && checkB.linha) return checkA.linha === checkB.linha;
  return checkA.ok && checkB.ok;
}

async function runAndCheck(steps: RecipeStep[], vars: UrlVars) {
  const result = await runRecipe(steps, vars);
  const check = await pdfLooksLikeBoleto(result.pdf.buffer);
  if (!check.ok) throw new Error(`A receita baixou um PDF que não é boleto: ${check.reason}`);
  return result;
}

export async function resolveUrl(
  url: string,
  options: { model: string; maxAttempts?: number; onProgress?: (line: string) => void },
): Promise<ResolveResult> {
  const trace: string[] = [];
  const log = (line: string) => {
    trace.push(line);
    options.onProgress?.(line);
  };
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);

  // 1) Redirecionamentos / PDF direto.
  let finalUrl = url;
  try {
    const first = await safeFetch(url, { timeoutMs: 20_000 });
    finalUrl = first.finalUrl;
    log(`link final: ${finalUrl} (HTTP ${first.status})`);
    if (first.status >= 500) throw new UnavailableError(`Site respondeu ${first.status}.`);
    if (first.status === 404 || first.status === 410) throw new LinkGoneError(`Link expirado ou inexistente (${first.status}).`);
    if (isPdfBuffer(first.body)) {
      const check = await pdfLooksLikeBoleto(first.body);
      if (check.ok) {
        log("o link já é o PDF do boleto");
        return { pdf: { url: finalUrl, buffer: first.body, via: "response" }, method: "direct", finalUrl, recipeId: null, trace };
      }
    }
  } catch (error) {
    if (error instanceof HostUnreachableError) throw new UnavailableError(error.message);
    if (isFatal(error)) throw error;
    // Sites que recusam fetch "cru" (403, anti-bot): seguimos com o navegador.
    log(`pré-checagem sem sucesso (${message(error)}); seguindo com o navegador`);
  }

  const vars = urlVars(finalUrl);
  const feedback: string[] = [];

  // 2) Receita aprendida.
  const recipe = await findRecipe(finalUrl);
  if (recipe) {
    const steps = recipe.steps as RecipeStep[];
    log(`receita v${recipe.version} encontrada para ${recipe.host}${recipe.pathPattern}: ${describeSteps(steps)}`);
    try {
      const result = await runAndCheck(steps, vars);
      await markRecipe(recipe.id, true);
      log("receita funcionou");
      return { pdf: result.pdf, method: "recipe", finalUrl, recipeId: recipe.id, trace: [...trace, ...result.trace] };
    } catch (error) {
      if (error instanceof UnavailableError || error instanceof LinkGoneError) throw error;
      if (error instanceof CaptchaError) {
        await markRecipe(recipe.id, false, message(error));
        throw error;
      }
      await markRecipe(recipe.id, false, message(error));
      feedback.push(`O caminho salvo anteriormente (${describeSteps(steps)}) parou de funcionar: ${message(error)}`);
      log(`caminho salvo falhou, buscando de novo: ${message(error)}`);
    }
  }

  // 3) Aprender → validar → salvar, com novas tentativas.
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    log(`busca: tentativa ${attempt}/${maxAttempts}`);
    let learned;
    try {
      learned = await learnPath({
        url: finalUrl,
        model: options.model,
        feedback,
        onLog: (line) => log(`  ${line}`),
      });
    } catch (error) {
      if (isFatal(error)) throw error;
      if (error instanceof NeedsHumanError && /pede dados/.test(error.message)) throw error;
      feedback.push(`Tentativa ${attempt}: ${message(error)}`);
      log(`  falhou: ${message(error)}`);
      continue;
    }

    // 4) Validação: repetir o caminho do zero, sem a LLM.
    const candidates = candidateRecipes({ recorded: learned.steps, pdfUrl: learned.pdf.url, vars });
    for (const steps of candidates) {
      log(`  validando: ${describeSteps(steps)}`);
      try {
        const replay = await runAndCheck(steps, vars);
        if (!(await samePdf(replay.pdf, learned.pdf))) {
          throw new Error("O caminho repetido baixou um boleto diferente do encontrado na primeira busca.");
        }
        const saved = await saveRecipe(finalUrl, steps);
        log(`  validado e salvo como receita v${saved.version} (${saved.host}${saved.pathPattern})`);
        return {
          pdf: replay.pdf,
          method: recipe ? "relearned" : "learned",
          finalUrl,
          recipeId: saved.id,
          trace,
        };
      } catch (error) {
        if (error instanceof UnavailableError || error instanceof CaptchaError) throw error;
        log(`  validação falhou: ${message(error)}`);
        feedback.push(
          `Tentativa ${attempt}: o caminho ${describeSteps(steps)} achou o boleto, mas não funcionou ao ser repetido do zero (${message(error)}). Procure um caminho mais direto e estável.`,
        );
      }
    }
  }

  throw new ResolveFailedError(
    `Não foi possível encontrar o caminho até o boleto após ${maxAttempts} tentativas. ${feedback.slice(-2).join(" | ")}`,
  );
}

export { closeSharedBrowser };
