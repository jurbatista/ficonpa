import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, payables } from "@/db/schema";
import { errorMessage, fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

/** Tira da lista um documento que não vai ser lançado (não era boleto, veio repetido…). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [document] = await getDb()
      .update(documents)
      .set({ status: "REJECTED", needsAttention: false, attentionReason: null })
      .where(eq(documents.id, id))
      .returning({ id: documents.id });
    if (!document) return fail("Boleto não encontrado.", 404);

    await getDb()
      .update(payables)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(and(eq(payables.documentId, id), ne(payables.status, "POSTED")));

    await logAudit("document_dismissed", { entity: "document", entityId: id, actor: "admin" });
    return ok({ dismissed: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
