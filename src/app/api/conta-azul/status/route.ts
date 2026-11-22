import { getConnection } from "@/lib/contaazul/connection";
import { countCatalogs } from "@/lib/contaazul/sync";
import { isContaAzulConfigured } from "@/lib/contaazul/oauth";
import { ok } from "@/lib/api";

export async function GET() {
  const connection = await getConnection();
  const catalogs = connection ? await countCatalogs() : null;
  return ok({
    configured: await isContaAzulConfigured(),
    connected: Boolean(connection),
    companyName: connection?.companyName ?? null,
    expiresAt: connection?.expiresAt ?? null,
    updatedAt: connection?.updatedAt ?? null,
    catalogs,
  });
}
