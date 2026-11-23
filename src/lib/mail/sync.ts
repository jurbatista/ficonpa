import { and, eq } from "drizzle-orm";
import { simpleParser } from "mailparser";
import { getDb } from "@/lib/db";
import { emailAccounts, emailLinks, emailMessages, linkRecipes } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { enqueue, LINK_JOB_OPTIONS, QUEUE_NAMES } from "@/lib/queue";
import { getSettings } from "@/lib/settings";
import { extractLinkCandidates } from "@/lib/links/extract";
import { createImapClient, describeImapError, hasPdfPart } from "./imap";
import { storePdfAttachment } from "./store";
import type { EmailAccount } from "@/db/schema";

export type SyncAccountResult = {
  scanned: number;
  newMessages: number;
  attachments: number;
  links: number;
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
    links: 0,
    skipped: 0,
  };
  const db = getDb();
  const client = createImapClient(account);
  client.on("error", () => undefined);
  const { linkResolverEnabled: scanLinks } = await getSettings();
  const knownHosts = scanLinks
    ? (await db.selectDistinct({ host: linkRecipes.host }).from(linkRecipes)).map((row) => row.host)
    : [];

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
      const hasPdf = hasPdfPart(message.bodyStructure as never);
      if (!hasPdf && !scanLinks) {
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
        const stored = await storePdfAttachment({
          messageId: inserted.id,
          filename: pdf.filename ?? `${sha256(content).slice(0, 8)}.pdf`,
          content,
        });
        if (stored.created) result.attachments += 1;
      }

      // Sem PDF anexado: procura links de cobrança no corpo (lido só em memória).
      if (pdfs.length === 0 && scanLinks) {
        const candidates = extractLinkCandidates({
          html: typeof parsed.html === "string" ? parsed.html : null,
          text: parsed.text ?? null,
          subject: parsed.subject ?? null,
          knownHosts,
        });
        for (const candidate of candidates) {
          const [link] = await db
            .insert(emailLinks)
            .values({
              messageId: inserted.id,
              url: candidate.url,
              host: new URL(candidate.url).hostname,
              anchorText: candidate.anchorText,
            })
            .onConflictDoNothing()
            .returning({ id: emailLinks.id });
          if (!link) continue;
          result.links += 1;
          await enqueue(QUEUE_NAMES.resolveLink, { linkId: link.id }, LINK_JOB_OPTIONS);
        }
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
    const message = describeImapError(error, account.host);
    console.warn(`[imap] sync ${account.email}: ${message}`);
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
