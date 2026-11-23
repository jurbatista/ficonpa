import "dotenv/config";
import { Worker } from "bullmq";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { attachmentDir } from "@/lib/env";
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
import { resolveEmailLink } from "@/lib/links/jobs";
import { closeSharedBrowser } from "@/lib/links/resolve";

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

  // Um link por vez: cada resolução abre um navegador headless.
  const linkWorker = new Worker(
    QUEUE_NAMES.resolveLink,
    async (job) => {
      const { linkId } = job.data as { linkId: string };
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      log("resolvendo link", { linkId, tentativa: job.attemptsMade + 1 });
      const result = await resolveEmailLink(linkId, { final });
      log("link resolvido", { linkId, ...result });
      return result;
    },
    { connection: redisConnection(), concurrency: 1, lockDuration: 10 * 60_000 },
  );

  for (const worker of [mailWorker, documentWorker, postWorker, purgeWorker, linkWorker]) {
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

  // Sinal de vida no volume compartilhado: o /api/health do web confere que o worker
  // está rodando e enxergando a mesma pasta de anexos.
  const heartbeat = async () => {
    try {
      const dir = path.dirname(attachmentDir());
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, ".worker-heartbeat"), new Date().toISOString());
    } catch (error) {
      log("falha ao gravar heartbeat", { error: error instanceof Error ? error.message : String(error) });
    }
  };
  await heartbeat();
  setInterval(heartbeat, 60_000).unref();

  log("workers prontos");
}

process.on("SIGTERM", async () => {
  log("encerrando");
  await closeSharedBrowser();
  process.exit(0);
});

main().catch((error) => {
  console.error("[worker] falha fatal", error);
  process.exit(1);
});
