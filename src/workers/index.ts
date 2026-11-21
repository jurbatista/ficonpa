import "dotenv/config";
import { Worker } from "bullmq";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { getDb } from "@/lib/db";
import {
  attachments,
  documents,
  emailAccounts,
  emailMessages,
  payables,
} from "@/db/schema";
import { getQueue, QUEUE_NAMES, redisConnection } from "@/lib/queue";
import { syncEmailAccount } from "@/lib/mail/sync";
import { processAttachment } from "@/lib/pipeline/process-document";
import { postPayable } from "@/lib/payables/post";
import { getSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

function log(message: string, extra?: unknown) {
  const suffix = extra === undefined ? "" : ` ${JSON.stringify(extra)}`;
  console.log(`[worker] ${new Date().toISOString()} ${message}${suffix}`);
}

async function runMailSync(data: { accountId?: string }) {
  const db = getDb();
  const accounts = data.accountId
    ? await db.select().from(emailAccounts).where(eq(emailAccounts.id, data.accountId))
    : await db.select().from(emailAccounts).where(eq(emailAccounts.active, true));

  for (const account of accounts) {
    const result = await syncEmailAccount(account);
    log(`mail-sync ${account.email}`, result);
  }
}

async function runPurge() {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000);
  const db = getDb();

  const oldAttachments = await db
    .select({ id: attachments.id, path: attachments.path })
    .from(attachments)
    .where(lt(attachments.createdAt, cutoff));

  const deletedPayables = await db
    .delete(payables)
    .where(
      or(
        lt(payables.postedAt, cutoff),
        and(isNull(payables.postedAt), lt(payables.createdAt, cutoff)),
      ),
    )
    .returning({ id: payables.id });

  const deletedDocuments = await db
    .delete(documents)
    .where(lt(documents.createdAt, cutoff))
    .returning({ id: documents.id });

  for (const attachment of oldAttachments) {
    await unlink(attachment.path).catch(() => undefined);
  }

  const deletedAttachments = await db
    .delete(attachments)
    .where(lt(attachments.createdAt, cutoff))
    .returning({ id: attachments.id });

  const deletedMessages = await db
    .delete(emailMessages)
    .where(lt(emailMessages.createdAt, cutoff))
    .returning({ id: emailMessages.id });

  if (
    deletedPayables.length ||
    deletedDocuments.length ||
    deletedAttachments.length ||
    deletedMessages.length
  ) {
    await logAudit("retention_purge", {
      actor: "sistema",
      payload: {
        cutoff: cutoff.toISOString(),
        payables: deletedPayables.length,
        documents: deletedDocuments.length,
        attachments: deletedAttachments.length,
        messages: deletedMessages.length,
      },
    });
    log("purge concluído", {
      cutoff: cutoff.toISOString(),
      payables: deletedPayables.length,
      documents: deletedDocuments.length,
      attachments: deletedAttachments.length,
      messages: deletedMessages.length,
    });
  }
}

async function main() {
  log("iniciando workers", {
    queues: Object.values(QUEUE_NAMES),
    redis: process.env.REDIS_URL ?? "redis://localhost:6379",
  });

  const mailWorker = new Worker(
    QUEUE_NAMES.mailSync,
    async (job) => {
      log(`job ${job.name}`);
      await runMailSync(job.data as { accountId?: string });
    },
    { connection: redisConnection(), concurrency: 2 },
  );

  const documentWorker = new Worker(
    QUEUE_NAMES.processDocument,
    async (job) => {
      const { attachmentId, force } = job.data as { attachmentId: string; force?: boolean };
      log("processando anexo", { attachmentId, force: Boolean(force) });
      const result = await processAttachment(attachmentId, { force });
      log("anexo processado", result);
      return result;
    },
    { connection: redisConnection(), concurrency: 2 },
  );

  const postWorker = new Worker(
    QUEUE_NAMES.postPayable,
    async (job) => {
      const { payableId, actor } = job.data as { payableId: string; actor?: string };
      log("lançando conta a pagar", { payableId });
      const result = await postPayable(payableId, actor ?? "sistema");
      log("lançamento finalizado", { payableId, ...result });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    { connection: redisConnection(), concurrency: 1 },
  );

  const purgeWorker = new Worker(
    QUEUE_NAMES.purge,
    async () => {
      await runPurge();
    },
    { connection: redisConnection(), concurrency: 1 },
  );

  for (const worker of [mailWorker, documentWorker, postWorker, purgeWorker]) {
    worker.on("failed", (job, error) => {
      log(`job falhou ${job?.queueName}/${job?.name}`, { error: error.message });
    });
  }

  // Agendamentos recorrentes (idempotentes).
  await getQueue(QUEUE_NAMES.mailSync).add(
    QUEUE_NAMES.mailSync,
    {},
    { repeat: { pattern: "*/15 * * * *" }, jobId: "mail-sync-cron" },
  );
  await getQueue(QUEUE_NAMES.purge).add(
    QUEUE_NAMES.purge,
    {},
    { repeat: { pattern: "0 * * * *" }, jobId: "purge-cron" },
  );

  log("workers prontos");
}

process.on("SIGTERM", async () => {
  log("encerrando");
  process.exit(0);
});

main().catch((error) => {
  console.error("[worker] falha fatal", error);
  process.exit(1);
});
