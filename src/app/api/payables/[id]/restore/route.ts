import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, payables } from "@/db/schema";
import { errorMessage, fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { priorChargeNote } from "@/lib/rules/dedupe";

/** Desfaz um descarte: o boleto volta para revisão. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [payable] = await getDb().select().from(payables).where(eq(payables.id, id)).limit(1);
    if (!payable) return fail("Boleto não encontrado.", 404);
    if (payable.status !== "REJECTED") return fail("Este boleto não está descartado.");

    await getDb()
      .update(payables)
      .set({ status: "DRAFT", error: null, updatedAt: new Date() })
      .where(eq(payables.id, id));
    // Se foi descartado por já existir, o motivo continua à vista na revisão.
    const note = await priorChargeNote(payable);
    await getDb()
      .update(documents)
      .set({ status: "READY", needsAttention: note !== null, attentionReason: note })
      .where(eq(documents.id, payable.documentId));

    await logAudit("payable_restored", { entity: "payable", entityId: id, actor: "admin" });
    return ok({ restored: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
