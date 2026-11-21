import { and, count, desc, eq, gte, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  attachments,
  documents,
  emailAccounts,
  emailMessages,
  payables,
} from "@/db/schema";
import { getSettings } from "@/lib/settings";

export type PayableListItem = {
  id: string;
  documentId: string;
  supplierName: string | null;
  supplierDocument: string | null;
  description: string | null;
  value: string | null;
  dueDate: string | null;
  status: string;
  origin: string;
  postedAt: Date | null;
  error: string | null;
  createdAt: Date;
  documentStatus: string;
  needsAttention: boolean;
  attentionReason: string | null;
  confidence: string | null;
  attachmentId: string | null;
  emailSubject: string | null;
  emailFrom: string | null;
};

export async function listPayables(options: {
  status?: string;
  statuses?: string[];
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const db = getDb();
  const filters = [];
  if (options.status) filters.push(eq(payables.status, options.status));
  if (options.statuses?.length) filters.push(inArray(payables.status, options.statuses));
  if (options.search) {
    const term = `%${options.search}%`;
    filters.push(
      or(
        ilike(payables.supplierName, term),
        ilike(payables.description, term),
        ilike(payables.supplierDocument, term),
      ),
    );
  }

  const rows = await db
    .select({
      id: payables.id,
      documentId: payables.documentId,
      supplierName: payables.supplierName,
      supplierDocument: payables.supplierDocument,
      description: payables.description,
      value: payables.value,
      dueDate: payables.dueDate,
      status: payables.status,
      origin: payables.origin,
      postedAt: payables.postedAt,
      error: payables.error,
      createdAt: payables.createdAt,
      documentStatus: documents.status,
      needsAttention: documents.needsAttention,
      attentionReason: documents.attentionReason,
      confidence: documents.confidence,
      attachmentId: attachments.id,
      emailSubject: emailMessages.subject,
      emailFrom: emailMessages.fromAddress,
    })
    .from(payables)
    .innerJoin(documents, eq(documents.id, payables.documentId))
    .innerJoin(attachments, eq(attachments.id, documents.attachmentId))
    .innerJoin(emailMessages, eq(emailMessages.id, attachments.messageId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(payables.createdAt))
    .limit(options.limit ?? 100)
    .offset(options.offset ?? 0);

  return rows as PayableListItem[];
}

export type AttentionDocument = {
  id: string;
  status: string;
  confidence: string | null;
  attentionReason: string | null;
  error: string | null;
  createdAt: Date;
  isBoleto: boolean | null;
  attachmentId: string;
  filename: string;
  emailSubject: string | null;
  emailFrom: string | null;
  extraction: unknown;
};

export async function listAttentionDocuments(limit = 100): Promise<AttentionDocument[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: documents.id,
      status: documents.status,
      confidence: documents.confidence,
      attentionReason: documents.attentionReason,
      error: documents.error,
      createdAt: documents.createdAt,
      isBoleto: documents.isBoleto,
      attachmentId: attachments.id,
      filename: attachments.filename,
      emailSubject: emailMessages.subject,
      emailFrom: emailMessages.fromAddress,
      extraction: documents.extraction,
    })
    .from(documents)
    .innerJoin(attachments, eq(attachments.id, documents.attachmentId))
    .innerJoin(emailMessages, eq(emailMessages.id, attachments.messageId))
    .where(
      inArray(documents.status, [
        "NO_SUPPLIER",
        "NEEDS_ATTENTION",
        "ERROR",
        "PENDING",
      ]),
    )
    .orderBy(desc(documents.createdAt))
    .limit(limit);

  return rows as AttentionDocument[];
}

export async function getPayableDetail(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      payable: payables,
      document: documents,
      attachment: attachments,
      message: emailMessages,
    })
    .from(payables)
    .innerJoin(documents, eq(documents.id, payables.documentId))
    .innerJoin(attachments, eq(attachments.id, documents.attachmentId))
    .innerJoin(emailMessages, eq(emailMessages.id, attachments.messageId))
    .where(eq(payables.id, id))
    .limit(1);
  return row ?? null;
}

export async function getDashboardStats() {
  const db = getDb();
  const settings = await getSettings();
  const since = new Date(Date.now() - settings.retentionDays * 86_400_000);

  const [total] = await db.select({ value: count() }).from(payables);
  const [posted] = await db
    .select({ value: count() })
    .from(payables)
    .where(eq(payables.status, "POSTED"));
  const [pending] = await db
    .select({ value: count() })
    .from(payables)
    .where(inArray(payables.status, ["DRAFT", "APPROVED", "FAILED"]));
  const [attention] = await db
    .select({ value: count() })
    .from(documents)
    .where(
      inArray(documents.status, ["NO_SUPPLIER", "NEEDS_ATTENTION", "ERROR", "PENDING"]),
    );
  const [recent] = await db
    .select({ value: count() })
    .from(payables)
    .where(gte(payables.createdAt, since));
  const [accounts] = await db.select({ value: count() }).from(emailAccounts);

  return {
    total: Number(total?.value ?? 0),
    posted: Number(posted?.value ?? 0),
    pending: Number(pending?.value ?? 0),
    attention: Number(attention?.value ?? 0),
    recent: Number(recent?.value ?? 0),
    emailAccounts: Number(accounts?.value ?? 0),
    retentionDays: settings.retentionDays,
    autoPostEnabled: settings.autoPostEnabled,
  };
}

export async function listEmailAccounts() {
  return getDb().select().from(emailAccounts).orderBy(desc(emailAccounts.createdAt));
}

export async function getRecentActivity(limit = 8) {
  const db = getDb();
  return db
    .select({
      id: documents.id,
      status: documents.status,
      createdAt: documents.createdAt,
      attentionReason: documents.attentionReason,
      attachmentId: attachments.id,
      filename: attachments.filename,
      emailSubject: emailMessages.subject,
      supplierName: payables.supplierName,
      value: payables.value,
      dueDate: payables.dueDate,
    })
    .from(documents)
    .innerJoin(attachments, eq(attachments.id, documents.attachmentId))
    .innerJoin(emailMessages, eq(emailMessages.id, attachments.messageId))
    .leftJoin(payables, eq(payables.documentId, documents.id))
    .orderBy(desc(documents.createdAt))
    .limit(limit);
}
