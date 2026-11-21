import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, payables } from "@/db/schema";
import { createContaAzulPayable } from "@/lib/contaazul/payables";
import { logAudit } from "@/lib/audit";

export type PostResult =
  | { ok: true; eventId: string }
  | { ok: false; error: string };

export async function postPayable(payableId: string, actor = "sistema"): Promise<PostResult> {
  const db = getDb();
  const [payable] = await db.select().from(payables).where(eq(payables.id, payableId)).limit(1);
  if (!payable) return { ok: false, error: "Lançamento não encontrado." };
  if (payable.status === "POSTED") {
    return { ok: true, eventId: payable.contaAzulEventId ?? "" };
  }

  const missing: string[] = [];
  if (!payable.supplierId) missing.push("fornecedor");
  if (!payable.categoryId) missing.push("categoria");
  if (!payable.financialAccountId) missing.push("conta financeira");
  if (!payable.value) missing.push("valor");
  if (!payable.dueDate) missing.push("vencimento");
  if (missing.length > 0) {
    const error = `Campos obrigatórios ausentes: ${missing.join(", ")}.`;
    await db.update(payables).set({ status: "FAILED", error, updatedAt: new Date() }).where(eq(payables.id, payableId));
    await db
      .update(documents)
      .set({ needsAttention: true, attentionReason: error })
      .where(eq(documents.id, payable.documentId));
    return { ok: false, error };
  }

  try {
    const created = await createContaAzulPayable({
      description: payable.description ?? `Conta a pagar ${payable.supplierName ?? ""}`.trim(),
      competenceDate: payable.competenceDate ?? payable.dueDate!,
      value: Number(payable.value),
      financialAccountId: payable.financialAccountId!,
      supplierId: payable.supplierId!,
      categoryId: payable.categoryId!,
      costCenterId: payable.costCenterId,
      dueDate: payable.dueDate!,
      externalReference: payable.referenciaExterna,
      observation: payable.description ?? undefined,
    });

    await db
      .update(payables)
      .set({
        status: "POSTED",
        contaAzulEventId: created.id,
        postedAt: new Date(),
        postedBy: actor,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(payables.id, payableId));

    await db
      .update(documents)
      .set({ status: "POSTED", needsAttention: false, attentionReason: null })
      .where(eq(documents.id, payable.documentId));

    await logAudit("payable_posted", {
      entity: "payable",
      entityId: payableId,
      actor,
      payload: { eventId: created.id, origin: payable.origin },
    });

    return { ok: true, eventId: created.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(payables)
      .set({ status: "FAILED", error: message, updatedAt: new Date() })
      .where(eq(payables.id, payableId));
    await db
      .update(documents)
      .set({ needsAttention: true, attentionReason: message })
      .where(eq(documents.id, payable.documentId));
    await logAudit("payable_post_failed", {
      entity: "payable",
      entityId: payableId,
      actor,
      payload: { error: message },
    });
    return { ok: false, error: message };
  }
}
