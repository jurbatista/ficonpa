import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attachments } from "@/db/schema";
import { attachmentDir } from "@/lib/env";
import { sha256 } from "@/lib/crypto";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";

/**
 * Grava um PDF em disco, registra o anexo e enfileira o processamento.
 * Se o mesmo arquivo (mesmo sha256) já existir, reaproveita o registro.
 */
export async function storePdfAttachment(input: {
  messageId: string;
  filename: string;
  content: Buffer;
  source?: "email" | "link";
  sourceUrl?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const db = getDb();
  const digest = sha256(input.content);
  const dir = attachmentDir();
  const filePath = path.join(dir, `${digest}.pdf`);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, input.content);

  const [row] = await db
    .insert(attachments)
    .values({
      messageId: input.messageId,
      filename: input.filename,
      mimeType: "application/pdf",
      size: input.content.length,
      sha256: digest,
      path: filePath,
      source: input.source ?? "email",
      sourceUrl: input.sourceUrl ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: attachments.id });

  if (row) {
    await enqueue(QUEUE_NAMES.processDocument, { attachmentId: row.id });
    return { id: row.id, created: true };
  }

  const [existing] = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(eq(attachments.sha256, digest))
    .limit(1);
  return { id: existing.id, created: false };
}
