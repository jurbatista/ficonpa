import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailLinks, emailMessages, linkRecipes } from "@/db/schema";
import { SOLVER_KEY_REFUSED, SOLVER_NO_BALANCE } from "./captcha";

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

/** Links que o sistema não conseguiu baixar e esperam uma pessoa. */
const STUCK = ["CAPTCHA", "NEEDS_HUMAN", "FAILED"];

function plainLinkReason(status: string, error: string | null): string | null {
  switch (status) {
    case "PENDING":
    case "RESOLVING":
      return "Abrindo o link…";
    case "CAPTCHA":
      // Quando o que falta é do nosso lado (saldo ou chave), diz o que resolver.
      if (error === SOLVER_NO_BALANCE || error === SOLVER_KEY_REFUSED) return error;
      return "O site pede uma confirmação que só uma pessoa consegue fazer.";
    case "NEEDS_HUMAN":
      return error && /pede dados|login/i.test(error)
        ? "O site pede login ou dados para mostrar o boleto."
        : "O boleto não foi encontrado na página.";
    case "FAILED":
      return "O boleto não foi encontrado neste link.";
    case "UNAVAILABLE":
      return "O site estava fora do ar.";
    case "NOT_FOUND":
      return "O link expirou ou a cobrança já foi paga.";
    case "BLOCKED":
      return "Este endereço não pode ser aberto pelo sistema.";
    default:
      return null;
  }
}

export async function listLinkRecipes() {
  const rows = await getDb().select().from(linkRecipes).orderBy(desc(linkRecipes.updatedAt));
  const perHost = new Map<string, number>();
  for (const row of rows) perHost.set(row.host, (perHost.get(row.host) ?? 0) + 1);
  return rows.map((row) => ({
    id: row.id,
    host: row.host.replace(/^www\./, ""),
    // O formato do link só interessa quando o mesmo site tem mais de um caminho.
    pathPattern: (perHost.get(row.host) ?? 0) > 1 ? row.pathPattern : "",
    successCount: row.successCount,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
  }));
}

export async function listEmailLinks(limit = 60) {
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
    host: (link.host ?? "").replace(/^www\./, ""),
    status: link.status,
    /** Falhou e veio de um e-mail: alguém precisa abrir o link. */
    stuck: STUCK.includes(link.status) && Boolean(link.messageId),
    reason: plainLinkReason(link.status, link.error),
    attachmentId: link.attachmentId,
    manual: !link.messageId,
    subject,
    from,
    details: [
      ...((link.trace as string[] | null) ?? []),
      ...(link.error ? [link.error] : []),
    ].map(neutral),
    createdAt: link.createdAt.toISOString(),
  }));
}

export type LinkRecipeView = Awaited<ReturnType<typeof listLinkRecipes>>[number];
export type EmailLinkView = Awaited<ReturnType<typeof listEmailLinks>>[number];
