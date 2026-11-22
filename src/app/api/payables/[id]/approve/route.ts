import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { payables } from "@/db/schema";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { errorMessage, fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [payable] = await getDb()
      .select()
      .from(payables)
      .where(eq(payables.id, id))
      .limit(1);
    if (!payable) return fail("Lançamento não encontrado.", 404);
    if (payable.status === "POSTED") return ok({ alreadyPosted: true });

    await getDb()
      .update(payables)
      .set({ status: "APPROVED", error: null, updatedAt: new Date() })
      .where(eq(payables.id, id));

    await enqueue(
      QUEUE_NAMES.postPayable,
      { payableId: id, actor: "admin" },
      { attempts: 1 },
    );
    await logAudit("payable_approved", {
      entity: "payable",
      entityId: id,
      actor: "admin",
    });
    return ok({ queued: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
