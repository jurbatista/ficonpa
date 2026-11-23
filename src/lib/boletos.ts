import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  attachments,
  documents,
  emailAccounts,
  emailLinks,
  emailMessages,
  payables,
} from "@/db/schema";
import { getConnection } from "@/lib/contaazul/connection";
import { isContaAzulConfigured } from "@/lib/contaazul/oauth";
import { formatDocument } from "@/lib/format";
import { getSettings } from "@/lib/settings";

/**
 * A tela principal: tudo o que chegou por e-mail, em três estados.
 *   revisar     — espera uma pessoa (inclui o que não pôde ser lido ou não tem fornecedor)
 *   lancados    — já está no Conta Azul
 *   descartados — alguém decidiu não lançar
 */
export type BoletoView = "revisar" | "lancados" | "descartados";

export type BoletoRow = {
  key: string;
  /** null quando o boleto ainda não virou lançamento (sem fornecedor ou não lido). */
  payableId: string | null;
  documentId: string;
  attachmentId: string;
  supplierName: string | null;
  supplierDocument: string | null;
  emailFrom: string | null;
  emailSubject: string | null;
  value: string | null;
  dueDate: string | null;
  status: string;
  note: string | null;
  auto: boolean;
  createdAt: Date;
  postedAt: Date | null;
};

const PAYABLE_STATUS: Record<BoletoView, string[]> = {
  revisar: ["DRAFT", "APPROVED", "FAILED"],
  lancados: ["POSTED"],
  descartados: ["REJECTED"],
};

export const LAUNCH_FAILED = "Não foi possível lançar no Conta Azul.";
const READ_FAILED = "Não foi possível ler o PDF.";

/** Documentos que precisam de alguém e não chegaram a virar lançamento. */
const STUCK_DOCUMENT = ["NO_SUPPLIER", "ERROR"];

/** Links de boleto que o sistema não conseguiu baixar e esperam uma pessoa. */
export const STUCK_LINK = ["CAPTCHA", "NEEDS_HUMAN", "FAILED"];

/**
 * Troca as mensagens internas por uma frase que diga o que falta. O que não for
 * reconhecido aparece depois de `fallback`, entre parênteses, para o suporte.
 */
export function plainReason(
  raw: string | null | undefined,
  fallback = "Não foi possível concluir.",
): string | null {
  if (!raw) return null;
  const text = raw.trim();

  const missing = text.match(/Campos obrigatórios ausentes: (.+?)\.?$/i);
  if (missing) return `Falta preencher: ${missing[1]}.`;
  if (/não resolvida por regra/i.test(text)) return "Falta escolher a categoria ou a conta.";
  if (/Fornecedor não encontrado/i.test(text)) return "Fornecedor não cadastrado no Conta Azul.";
  if (/Conta Azul não conectad/i.test(text)) return "O Conta Azul não está conectado.";
  if (
    /renovar token|invalid_grant|Conta Azul 401|initialization vector|unable to authenticate data|Formato de segredo/i.test(
      text,
    )
  ) {
    return "A conexão com o Conta Azul precisa ser refeita.";
  }

  const refused = text.match(/^Conta Azul (\d{3}): ([\s\S]*)$/);
  if (refused) {
    let detail = "";
    try {
      const body = JSON.parse(refused[2]) as Record<string, unknown>;
      const message = body.error ?? body.message ?? body.mensagem ?? body.error_description;
      if (typeof message === "string") detail = message;
    } catch {
      detail = "";
    }
    return detail
      ? `O Conta Azul recusou: ${detail.slice(0, 160)}`
      : "O Conta Azul recusou o lançamento.";
  }

  if (/ENOENT|no such file/i.test(text)) return "O arquivo do boleto não está mais disponível.";
  if (/Serviço de (leitura|conferência)/i.test(text)) return "A leitura automática está fora do ar.";
  if (/^PDF com \d+ páginas/i.test(text)) return text;
  return `${fallback} (${text.length > 120 ? `${text.slice(0, 120)}…` : text})`;
}

/** Diz qual CNPJ falta cadastrar, que é o que a pessoa precisa para resolver. */
function missingSupplier(document: string | null): string {
  const formatted = formatDocument(document);
  const digits = (document ?? "").replace(/\D/g, "");
  if (!formatted || (digits.length !== 14 && digits.length !== 11)) {
    return "Fornecedor não cadastrado no Conta Azul.";
  }
  return `${digits.length === 14 ? "CNPJ" : "CPF"} ${formatted} não cadastrado no Conta Azul.`;
}

function matches(term: string, ...values: (string | null)[]): boolean {
  const needle = term.toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(needle));
}

export async function listBoletos(view: BoletoView, search?: string): Promise<BoletoRow[]> {
  const db = getDb();
  const filters = [inArray(payables.status, PAYABLE_STATUS[view])];
  if (search) {
    const term = `%${search}%`;
    filters.push(
      or(
        ilike(payables.supplierName, term),
        ilike(payables.supplierDocument, term),
        ilike(payables.description, term),
        ilike(emailMessages.fromAddress, term),
      )!,
    );
  }

  const fromPayables = await db
    .select({
      payableId: payables.id,
      documentId: payables.documentId,
      attachmentId: attachments.id,
      supplierName: payables.supplierName,
      supplierDocument: payables.supplierDocument,
      value: payables.value,
      dueDate: payables.dueDate,
      status: payables.status,
      origin: payables.origin,
      error: payables.error,
      createdAt: payables.createdAt,
      postedAt: payables.postedAt,
      needsAttention: documents.needsAttention,
      attentionReason: documents.attentionReason,
      emailFrom: emailMessages.fromAddress,
      emailSubject: emailMessages.subject,
    })
    .from(payables)
    .innerJoin(documents, eq(documents.id, payables.documentId))
    .innerJoin(attachments, eq(attachments.id, documents.attachmentId))
    .innerJoin(emailMessages, eq(emailMessages.id, attachments.messageId))
    .where(and(...filters))
    .orderBy(view === "lancados" ? desc(payables.postedAt) : desc(payables.createdAt))
    .limit(300);

  const rows: BoletoRow[] = fromPayables.map((row) => ({
    key: row.payableId,
    payableId: row.payableId,
    documentId: row.documentId,
    attachmentId: row.attachmentId,
    supplierName: row.supplierName,
    supplierDocument: row.supplierDocument,
    emailFrom: row.emailFrom,
    emailSubject: row.emailSubject,
    value: row.value,
    dueDate: row.dueDate,
    status: row.status,
    note:
      row.status === "FAILED"
        ? plainReason(row.error, LAUNCH_FAILED)
        : row.status === "DRAFT" && row.needsAttention
          ? plainReason(row.attentionReason)
          : null,
    auto: row.origin === "auto",
    createdAt: row.createdAt,
    postedAt: row.postedAt,
  }));

  if (view !== "revisar") return rows;

  const stuck = await db
    .select({
      documentId: documents.id,
      attachmentId: attachments.id,
      status: documents.status,
      attentionReason: documents.attentionReason,
      error: documents.error,
      createdAt: documents.createdAt,
      supplierName: sql<string | null>`${documents.extraction}->>'supplierName'`,
      supplierDocument: sql<string | null>`${documents.extraction}->>'supplierDocument'`,
      value: sql<string | null>`${documents.extraction}->>'value'`,
      dueDate: sql<string | null>`${documents.extraction}->>'dueDate'`,
      emailFrom: emailMessages.fromAddress,
      emailSubject: emailMessages.subject,
    })
    .from(documents)
    .innerJoin(attachments, eq(attachments.id, documents.attachmentId))
    .innerJoin(emailMessages, eq(emailMessages.id, attachments.messageId))
    .leftJoin(payables, eq(payables.documentId, documents.id))
    .where(and(inArray(documents.status, STUCK_DOCUMENT), isNull(payables.id)))
    .orderBy(desc(documents.createdAt))
    .limit(300);

  for (const row of stuck) {
    if (search && !matches(search, row.supplierName, row.supplierDocument, row.emailFrom, row.emailSubject)) {
      continue;
    }
    rows.push({
      key: row.documentId,
      payableId: null,
      documentId: row.documentId,
      attachmentId: row.attachmentId,
      supplierName: row.supplierName,
      supplierDocument: row.supplierDocument,
      emailFrom: row.emailFrom,
      emailSubject: row.emailSubject,
      value: row.value,
      dueDate: row.dueDate,
      status: row.status,
      note:
        row.status === "NO_SUPPLIER"
          ? missingSupplier(row.supplierDocument)
          : plainReason(row.error ?? row.attentionReason, READ_FAILED),
      auto: false,
      createdAt: row.createdAt,
      postedAt: null,
    });
  }

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export type Overview = {
  mailboxes: number;
  /** Quando há uma só caixa, o endereço dela. */
  mailbox: string | null;
  mailboxWithError: string | null;
  lastCheckAt: Date | null;
  contaAzulConnected: boolean;
  contaAzulConfigured: boolean;
  autoPost: boolean;
  counts: Record<BoletoView, number>;
  stuckLinks: number;
};

export async function getOverview(): Promise<Overview> {
  const db = getDb();
  const [accounts, connection, configured, settings, byStatus, [stuckDocs], [links]] =
    await Promise.all([
      db
        .select({
          email: emailAccounts.email,
          active: emailAccounts.active,
          lastError: emailAccounts.lastError,
          lastSyncAt: emailAccounts.lastSyncAt,
        })
        .from(emailAccounts)
        .orderBy(emailAccounts.createdAt),
      getConnection(),
      isContaAzulConfigured(),
      getSettings(),
      db.select({ status: payables.status, total: count() }).from(payables).groupBy(payables.status),
      db
        .select({ total: count() })
        .from(documents)
        .leftJoin(payables, eq(payables.documentId, documents.id))
        .where(and(inArray(documents.status, STUCK_DOCUMENT), isNull(payables.id))),
      db
        .select({ total: count() })
        .from(emailLinks)
        .where(and(inArray(emailLinks.status, STUCK_LINK), isNotNull(emailLinks.messageId))),
    ]);

  const total = (statuses: string[]) =>
    byStatus
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + Number(row.total), 0);

  const checks = accounts
    .map((account) => account.lastSyncAt?.getTime() ?? 0)
    .filter((time) => time > 0);

  return {
    mailboxes: accounts.length,
    mailbox: accounts.length === 1 ? accounts[0].email : null,
    mailboxWithError: accounts.find((account) => account.active && account.lastError)?.email ?? null,
    lastCheckAt: checks.length > 0 ? new Date(Math.max(...checks)) : null,
    contaAzulConnected: Boolean(connection),
    contaAzulConfigured: configured,
    autoPost: settings.autoPostEnabled,
    counts: {
      revisar: total(PAYABLE_STATUS.revisar) + Number(stuckDocs?.total ?? 0),
      lancados: total(PAYABLE_STATUS.lancados),
      descartados: total(PAYABLE_STATUS.descartados),
    },
    stuckLinks: Number(links?.total ?? 0),
  };
}
