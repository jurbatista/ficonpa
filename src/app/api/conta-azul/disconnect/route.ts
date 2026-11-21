import { deleteConnection } from "@/lib/contaazul/connection";
import { ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST() {
  await deleteConnection();
  await logAudit("conta_azul_disconnected", { entity: "conta_azul_connection" });
  return ok({ connected: false });
}
