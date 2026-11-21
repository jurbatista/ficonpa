import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, payables } from "@/db/schema";
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
    if (payable.status === "POSTED") {
      return fail("Lançamento já enviado ao Conta Azul.");
    }

    await getDb()
      .update(payables)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(eq(payables.id, id));
    await getDb()
      .update(documents)
      .set({ status: "REJECTED", needsAttention: false, attentionReason: null })
      .where(eq(documents.id, payable.documentId));

    await logAudit("payable_rejected", {
      entity: "payable",
      entityId: id,
      actor: "admin",
    });
    return ok({ rejected: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
