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
/** E-mail sem PDF: só o começo é baixado, o suficiente para achar os links do corpo. */
const BODY_PREVIEW_BYTES = 300 * 1024;
/** Link de cobrança velho quase sempre já venceu ou foi pago: não vale abrir. */
const LINK_MAX_AGE_DAYS = 15;
/** A cada tantas mensagens o progresso é salvo, para uma queda não recomeçar do zero. */
const CHECKPOINT_EVERY = 10;

type Listed = {
  uid: number;
  messageId: string;
  size: number;
  hasPdf: boolean;
  receivedAt: Date | null;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function syncEmailAccount(account: EmailAccount): Promise<SyncAccountResult> {
  const result: SyncAccountResult = {
    scanned: 0,
    newMessages: 0,
    attachments: 0,
    links: 0,
    skipped: 0,
  };
  const db = getDb();
  const { linkResolverEnabled: scanLinks } = await getSettings();
  const knownHosts = scanLinks
    ? (await db.selectDistinct({ host: linkRecipes.host }).from(linkRecipes)).map((row) => row.host)
    : [];
  const linkCutoff = Date.now() - LINK_MAX_AGE_DAYS * 86_400_000;

  let client: Awaited<ReturnType<typeof createImapClient>> | null = null;
  let checkpoint = account.lastUid;

  try {
    const imap = await createImapClient(account);
    client = imap;
    imap.on("error", () => undefined);
    await imap.connect();
    const mailbox = await imap.mailboxOpen(account.folder);
    const uidValidity = String(mailbox.uidValidity ?? "");
    const mailboxChanged = Boolean(account.uidValidity) && account.uidValidity !== uidValidity;
    const incremental = account.lastUid > 0 && !mailboxChanged;
    if (!incremental) checkpoint = 0;

    let range: string | number[];
    if (incremental) {
      range = `${account.lastUid + 1}:*`;
    } else {
      const since = new Date();
      since.setDate(since.getDate() - (account.lookbackDays || 30));
      const uids = await imap.search({ since }, { uid: true });
      if (!uids || uids.length === 0) {
        await db
          .update(emailAccounts)
          .set({ uidValidity, lastUid: 0, lastSyncAt: new Date(), lastError: null })
          .where(eq(emailAccounts.id, account.id));
        return result;
      }
      range = uids;
    }

    // 1) Lista as mensagens. Nenhum outro comando pode ser enviado ao servidor enquanto
    //    a listagem está em andamento — por isso o conteúdo é baixado só depois.
    const listed: Listed[] = [];
    for await (const message of imap.fetch(
      range,
      { uid: true, envelope: true, bodyStructure: true, size: true, internalDate: true },
      { uid: true },
    )) {
      const uid = Number(message.uid ?? 0);
      // "N:*" devolve a última mensagem mesmo quando não há nada novo.
      if (!uid || (incremental && uid <= account.lastUid)) continue;
      listed.push({
        uid,
        // Algumas cobranças automáticas vêm sem Message-ID: usa a posição na caixa.
        messageId: message.envelope?.messageId || `<uid-${uidValidity}-${uid}@${account.id}>`,
        size: Number(message.size ?? 0),
        hasPdf: hasPdfPart(message.bodyStructure as never),
        receivedAt: toDate(message.internalDate) ?? toDate(message.envelope?.date),
      });
    }
    listed.sort((a, b) => a.uid - b.uid);

    const saveProgress = async (uid: number) => {
      checkpoint = uid;
      await db
        .update(emailAccounts)
        .set({ uidValidity, lastUid: uid, lastSyncAt: new Date(), lastError: null })
        .where(eq(emailAccounts.id, account.id));
    };

    const handleMessage = async (item: Listed): Promise<void> => {
      const already = await db
        .select({ id: emailMessages.id })
        .from(emailMessages)
        .where(
          and(eq(emailMessages.accountId, account.id), eq(emailMessages.messageId, item.messageId)),
        )
        .limit(1);
      if (already.length > 0 || item.size > MAX_MESSAGE_BYTES) {
        result.skipped += 1;
        return;
      }

      const recent = !item.receivedAt || item.receivedAt.getTime() >= linkCutoff;
      const lookForLinks = !item.hasPdf && scanLinks && recent;
      if (!item.hasPdf && !lookForLinks) {
        result.skipped += 1;
        return;
      }

      const fetched = await imap.fetchOne(
        String(item.uid),
        { source: item.hasPdf ? true : { start: 0, maxLength: BODY_PREVIEW_BYTES } },
        { uid: true },
      );
      const source = fetched ? fetched.source : undefined;
      if (!source) {
        result.skipped += 1;
        return;
      }

      const parsed = await simpleParser(source);
      const pdfs = (parsed.attachments ?? []).filter((attachment) => {
        const name = attachment.filename ?? "";
        return (
          attachment.contentType === "application/pdf" ||
          /\.pdf$/i.test(name) ||
          (attachment.contentType ?? "").includes("pdf")
        );
      });
      const candidates =
        pdfs.length === 0 && lookForLinks
          ? extractLinkCandidates({
              html: typeof parsed.html === "string" ? parsed.html : null,
              text: parsed.text ?? null,
              subject: parsed.subject ?? null,
              knownHosts,
            })
          : [];

      // Nem PDF nem link de cobrança: a mensagem não interessa e nada dela é guardado.
      if (pdfs.length === 0 && candidates.length === 0) {
        result.skipped += 1;
        return;
      }

      const [inserted] = await db
        .insert(emailMessages)
        .values({
          accountId: account.id,
          messageId: item.messageId,
          fromAddress: parsed.from?.text ?? null,
          subject: parsed.subject ?? null,
          receivedAt: parsed.date ?? item.receivedAt,
          rawSha256: sha256(source),
          status: "received",
        })
        .onConflictDoNothing()
        .returning({ id: emailMessages.id });
      if (!inserted) {
        result.skipped += 1;
        return;
      }
      result.newMessages += 1;

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
    };

    // 2) Baixa e trata uma mensagem por vez, da mais antiga para a mais nova.
    for (const [index, item] of listed.entries()) {
      result.scanned += 1;
      try {
        await handleMessage(item);
      } catch (error) {
        // Conexão caiu: não adianta continuar. Qualquer outro erro é só desta mensagem.
        if (!imap.usable) throw error;
        result.skipped += 1;
        console.warn(
          `[imap] sync ${account.email}: mensagem ${item.uid} ignorada (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      if ((index + 1) % CHECKPOINT_EVERY === 0) await saveProgress(item.uid);
    }

    await saveProgress(listed.length > 0 ? listed[listed.length - 1].uid : checkpoint);
    return result;
  } catch (error) {
    const problem = describeImapError(error, account.host);
    const message = problem.message;
    console.warn(`[imap] sync ${account.email}: ${problem.raw}`);
    result.error = message;
    await db
      .update(emailAccounts)
      .set({ lastError: message, lastSyncAt: new Date(), lastUid: checkpoint })
      .where(eq(emailAccounts.id, account.id));
    return result;
  } finally {
    await client?.logout().catch(() => undefined);
  }
}
