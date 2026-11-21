import { getPayableDetail } from "@/lib/queries";
import { fail, ok } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = await getPayableDetail(id);
  if (!row) return fail("Lançamento não encontrado.", 404);
  return ok(row);
}
