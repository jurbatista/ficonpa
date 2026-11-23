import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  attachments,
  documents,
  emailAccounts,
  emailMessages,
  payables,
} from "@/db/schema";

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

export async function listEmailAccounts() {
  return getDb().select().from(emailAccounts).orderBy(desc(emailAccounts.createdAt));
}
