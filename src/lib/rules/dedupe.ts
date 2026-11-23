import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { payables } from "@/db/schema";

export async function isDuplicatePayable(input: {
  supplierId: string | null;
  supplierDocument: string | null;
  value: number | null;
  dueDate: string | null;
  /** Documento em processamento: o lançamento dele mesmo não conta como duplicado. */
  documentId?: string;
}): Promise<boolean> {
  if (!input.value || !input.dueDate) return false;
  const value = input.value.toFixed(2);

  const conditions = [
    ne(payables.status, "REJECTED"),
    eq(payables.value, value),
    eq(payables.dueDate, input.dueDate),
  ];
  if (input.supplierId) conditions.push(eq(payables.supplierId, input.supplierId));
  if (input.documentId) conditions.push(ne(payables.documentId, input.documentId));

  const [existing] = await getDb()
    .select({ id: payables.id })
    .from(payables)
    .where(and(...conditions))
    .limit(1);

  return Boolean(existing);
}
