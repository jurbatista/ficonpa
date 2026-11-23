import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailLinks, emailMessages, linkRecipes } from "@/db/schema";
import { describeSteps, type RecipeStep } from "./steps";

/** Registros antigos podem trazer termos internos; a tela só mostra linguagem neutra. */
const NEUTRAL: [RegExp, string][] = [
  [/(agente|qwen|jev)\/openrouter/gi, "Serviço de leitura"],
  [/chave da openrouter/gi, "serviço de leitura"],
  [/openrouter|qwen|\bjev\b|\bLLM\b/gi, "serviço de leitura"],
  [/\bo (agente|modelo)\b/gi, "o sistema"],
  [/\bagente\b/gi, "sistema"],
  [/reaprendendo/gi, "buscando de novo"],
  [/aprendizado/gi, "busca"],
  [/aprender o caminho/gi, "encontrar o caminho"],
];

function neutral(text: string): string {
  return NEUTRAL.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

export async function listLinkRecipes() {
  const rows = await getDb().select().from(linkRecipes).orderBy(desc(linkRecipes.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    host: row.host,
    pathPattern: row.pathPattern,
    summary: describeSteps(row.steps as RecipeStep[]),
    fast: (row.steps as RecipeStep[]).length === 1 && (row.steps as RecipeStep[])[0].op === "fetchPdf",
    active: row.active,
    version: row.version,
    successCount: row.successCount,
    failureCount: row.failureCount,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
    lastError: row.lastError ? neutral(row.lastError) : null,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function listEmailLinks(limit = 100) {
  const rows = await getDb()
    .select({
      link: emailLinks,
      subject: emailMessages.subject,
      from: emailMessages.fromAddress,
    })
    .from(emailLinks)
    .leftJoin(emailMessages, eq(emailMessages.id, emailLinks.messageId))
    .orderBy(desc(emailLinks.createdAt))
    .limit(limit);
  return rows.map(({ link, subject, from }) => ({
    id: link.id,
    url: link.url,
    host: link.host,
    status: link.status,
    method: link.method,
    attempts: link.attempts,
    error: link.error ? neutral(link.error) : null,
    attachmentId: link.attachmentId,
    manual: !link.messageId,
    subject,
    from,
    trace: ((link.trace as string[] | null) ?? []).map(neutral),
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  }));
}

export type LinkRecipeView = Awaited<ReturnType<typeof listLinkRecipes>>[number];
export type EmailLinkView = Awaited<ReturnType<typeof listEmailLinks>>[number];
