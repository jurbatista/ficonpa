import { syncContaAzulCatalogs } from "@/lib/contaazul/sync";
import { errorMessage, fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST() {
  try {
    const result = await syncContaAzulCatalogs();
    await logAudit("conta_azul_catalog_sync", { payload: result });
    return ok(result);
  } catch (error) {
    return fail(errorMessage(error));
  }
}
