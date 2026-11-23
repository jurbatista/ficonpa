import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailLinks } from "@/db/schema";
import { enqueue, LINK_JOB_OPTIONS, QUEUE_NAMES } from "@/lib/queue";
import { errorMessage, fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [link] = await getDb()
      .update(emailLinks)
      .set({ status: "PENDING", error: null, updatedAt: new Date() })
      .where(eq(emailLinks.id, id))
      .returning({ id: emailLinks.id });
    if (!link) return fail("Link não encontrado.", 404);
    await enqueue(QUEUE_NAMES.resolveLink, { linkId: id }, { ...LINK_JOB_OPTIONS, attempts: 1 });
    await logAudit("link_retry", { entity: "email_link", entityId: id });
    return ok({ queued: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
