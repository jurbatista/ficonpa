import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents } from "@/db/schema";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { errorMessage, fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [document] = await getDb()
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    if (!document) return fail("Documento não encontrado.", 404);

    await getDb()
      .update(documents)
      .set({ status: "PENDING", error: null, attentionReason: null })
      .where(eq(documents.id, id));
    await enqueue(QUEUE_NAMES.processDocument, {
      attachmentId: document.attachmentId,
      force: true,
    });
    await logAudit("document_reprocessed", {
      entity: "document",
      entityId: id,
      actor: "admin",
    });
    return ok({ queued: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
