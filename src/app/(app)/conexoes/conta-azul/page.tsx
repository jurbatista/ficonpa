import { ContaAzulPanel, type ContaAzulView } from "@/components/app/conta-azul-panel";
import { PageHeader } from "@/components/app/ui";
import { getConnection } from "@/lib/contaazul/connection";
import { isContaAzulConfigured } from "@/lib/contaazul/oauth";
import { getCatalogStatus } from "@/lib/contaazul/sync";

export const dynamic = "force-dynamic";

export default async function ContaAzulPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  const [params, connection, configured] = await Promise.all([
    searchParams,
    getConnection(),
    isContaAzulConfigured(),
  ]);
  const catalogs = connection ? await getCatalogStatus() : null;

  const data: ContaAzulView = {
    configured,
    connected: Boolean(connection),
    companyName: connection?.companyName ?? null,
    catalogs: catalogs && {
      people: catalogs.people,
      categories: catalogs.categories,
      financialAccounts: catalogs.financialAccounts,
      syncedAt: catalogs.syncedAt ? catalogs.syncedAt.toISOString() : null,
    },
  };

  const notice =
    params.status === "ok"
      ? { type: "ok" as const, message: params.message ?? null }
      : params.status === "error"
        ? { type: "erro" as const, message: params.message ?? null }
        : null;

  return (
    <>
      <PageHeader title="Conta Azul" />
      <div className="px-5 pb-8 lg:px-7">
        <ContaAzulPanel data={data} notice={notice} />
      </div>
    </>
  );
}
