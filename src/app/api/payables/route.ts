import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, payables } from "@/db/schema";
import { errorMessage, fail, ok, readJson } from "@/lib/api";
import { listPayables } from "@/lib/queries";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rows = await listPayables({
    status: url.searchParams.get("status") ?? undefined,
    search: url.searchParams.get("q") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 100),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });
  return ok(rows);
}

type Body = {
  supplierId?: string;
  supplierName?: string;
  categoryId?: string;
  categoryName?: string;
  financialAccountId?: string;
  financialAccountName?: string;
  costCenterId?: string | null;
  costCenterName?: string | null;
  description?: string;
  value?: number;
  dueDate?: string;
  competenceDate?: string;
};

export async function PATCH(request: Request) {
  try {
    const body = await readJson<{ id?: string } & Body>(request);
    if (!body.id) return fail("Informe o id do lançamento.");

    const [payable] = await getDb()
      .select()
      .from(payables)
      .where(eq(payables.id, body.id))
      .limit(1);
    if (!payable) return fail("Lançamento não encontrado.", 404);
    if (payable.status === "POSTED") {
      return fail("Lançamento já enviado ao Conta Azul.");
    }

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.supplierId) values.supplierId = body.supplierId;
    if (body.supplierName) values.supplierName = body.supplierName;
    if (body.categoryId) values.categoryId = body.categoryId;
    if (body.categoryName) values.categoryName = body.categoryName;
    if (body.financialAccountId) values.financialAccountId = body.financialAccountId;
    if (body.financialAccountName) values.financialAccountName = body.financialAccountName;
    if (body.costCenterId !== undefined) values.costCenterId = body.costCenterId;
    if (body.costCenterName !== undefined) values.costCenterName = body.costCenterName;
    if (body.description) values.description = body.description;
    if (body.value) values.value = Number(body.value).toFixed(2);
    if (body.dueDate) values.dueDate = body.dueDate;
    if (body.competenceDate) values.competenceDate = body.competenceDate;

    await getDb().update(payables).set(values).where(eq(payables.id, body.id));
    await getDb()
      .update(documents)
      .set({ needsAttention: false, attentionReason: null, status: "READY" })
      .where(eq(documents.id, payable.documentId));

    await logAudit("payable_updated", {
      entity: "payable",
      entityId: body.id,
      payload: { fields: Object.keys(values) },
    });
    return ok({ id: body.id });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
