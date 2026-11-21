import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { simpleParser } from "mailparser";
import { getDb } from "@/lib/db";
import { attachments, emailAccounts, emailMessages } from "@/db/schema";
import { attachmentDir } from "@/lib/env";
import { sha256 } from "@/lib/crypto";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { createImapClient, hasPdfPart } from "./imap";
import type { EmailAccount } from "@/db/schema";

export type SyncAccountResult = {
  scanned: number;
  newMessages: number;
  attachments: number;
  skipped: number;
  error?: string;
};

const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

export async function syncEmailAccount(account: EmailAccount): Promise<SyncAccountResult> {
  const result: SyncAccountResult = {
    scanned: 0,
    newMessages: 0,
    attachments: 0,
    skipped: 0,
  };
  const db = getDb();
  const client = createImapClient(account);

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(account.folder);
    const uidValidity = String(mailbox.uidValidity ?? "");
    const mailboxChanged = Boolean(account.uidValidity) && account.uidValidity !== uidValidity;

    let range: string | null = null;
    if (account.lastUid > 0 && !mailboxChanged) {
      range = `${account.lastUid + 1}:*`;
    } else {
      const since = new Date();
      since.setDate(since.getDate() - (account.lookbackDays || 30));
      const uids = await client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) {
        await db
          .update(emailAccounts)
          .set({
            uidValidity,
            lastUid: account.lastUid,
            lastSyncAt: new Date(),
            lastError: null,
          })
          .where(eq(emailAccounts.id, account.id));
        return result;
      }
      range = uids.join(",");
    }

    let maxUid = account.lastUid;

    for await (const message of client.fetch(
      range,
      { uid: true, envelope: true, bodyStructure: true, size: true },
      { uid: true },
    )) {
      result.scanned += 1;
      const uid = Number(message.uid ?? 0);
      if (uid > maxUid) maxUid = uid;

      const messageId = message.envelope?.messageId;
      if (!messageId) {
        result.skipped += 1;
        continue;
      }

      const already = await db
        .select({ id: emailMessages.id })
        .from(emailMessages)
        .where(
          and(eq(emailMessages.accountId, account.id), eq(emailMessages.messageId, messageId)),
        )
        .limit(1);
      if (already.length > 0) {
        result.skipped += 1;
        continue;
      }

      const size = Number(message.size ?? 0);
      if (size > MAX_MESSAGE_BYTES) {
        result.skipped += 1;
        continue;
      }
      if (!hasPdfPart(message.bodyStructure as never)) {
        result.skipped += 1;
        continue;
      }

      const full = await client.fetchOne(uid, { source: true }, { uid: true });
      const source = full ? full.source : undefined;
      if (!source) {
        result.skipped += 1;
        continue;
      }

      const parsed = await simpleParser(source);
      const [inserted] = await db
        .insert(emailMessages)
        .values({
          accountId: account.id,
          messageId,
          fromAddress: parsed.from?.text ?? null,
          subject: parsed.subject ?? null,
          receivedAt: parsed.date ?? null,
          rawSha256: sha256(source),
          status: "received",
        })
        .onConflictDoNothing()
        .returning({ id: emailMessages.id });

      if (!inserted) {
        result.skipped += 1;
        continue;
      }
      result.newMessages += 1;

      const pdfs = (parsed.attachments ?? []).filter((attachment) => {
        const name = attachment.filename ?? "";
        return (
          attachment.contentType === "application/pdf" ||
          /\.pdf$/i.test(name) ||
          (attachment.contentType ?? "").includes("pdf")
        );
      });

      for (const pdf of pdfs.slice(0, MAX_ATTACHMENTS)) {
        const content = pdf.content;
        if (!content || content.length === 0) continue;
        const digest = sha256(content);
        const filename = pdf.filename ?? `${digest.slice(0, 8)}.pdf`;
        const dir = attachmentDir();
        const filePath = path.join(dir, `${digest}.pdf`);
        await mkdir(dir, { recursive: true });
        await writeFile(filePath, content);

        const [attachmentRow] = await db
          .insert(attachments)
          .values({
            messageId: inserted.id,
            filename,
            mimeType: "application/pdf",
            size: content.length,
            sha256: digest,
            path: filePath,
          })
          .onConflictDoNothing()
          .returning({ id: attachments.id });

        if (!attachmentRow) continue;
        result.attachments += 1;
        await enqueue(QUEUE_NAMES.processDocument, { attachmentId: attachmentRow.id });
      }
    }

    await db
      .update(emailAccounts)
      .set({
        uidValidity,
        lastUid: maxUid,
        lastSyncAt: new Date(),
        lastError: null,
      })
      .where(eq(emailAccounts.id, account.id));

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.error = message;
    await db
      .update(emailAccounts)
      .set({ lastError: message, lastSyncAt: new Date() })
      .where(eq(emailAccounts.id, account.id));
    return result;
  } finally {
    await client.logout().catch(() => undefined);
  }
}
