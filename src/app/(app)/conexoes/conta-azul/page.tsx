import { ContaAzulPanel, type ContaAzulView } from "@/components/app/conta-azul-panel";
import { PageHeader } from "@/components/app/ui";
import { getConnection } from "@/lib/contaazul/connection";
import { isContaAzulConfigured } from "@/lib/contaazul/oauth";
import { countCatalogs } from "@/lib/contaazul/sync";

export const dynamic = "force-dynamic";

export default async function ContaAzulPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  const params = await searchParams;
  const connection = await getConnection();
  const catalogs = connection ? await countCatalogs() : null;

  const data: ContaAzulView = {
    configured: isContaAzulConfigured(),
    connected: Boolean(connection),
    companyName: connection?.companyName ?? null,
    expiresAt: connection?.expiresAt ? connection.expiresAt.toISOString() : null,
    updatedAt: connection?.updatedAt ? connection.updatedAt.toISOString() : null,
    catalogs,
  };

  return (
    <>
      <PageHeader
        title="Conta Azul"
        description="Conexão OAuth e cadastros usados para classificar e lançar contas a pagar."
      />
      <div className="space-y-5 px-5 pb-8 lg:px-7">
        {params.status === "ok" && (
          <div className="rounded-xl border border-success-500/30 bg-badge-success-background px-4 py-3 text-sm text-badge-success-text">
            Conta Azul conectado com sucesso.
            {params.message ? ` Aviso: ${params.message}` : ""}
          </div>
        )}
        {params.status === "error" && (
          <div className="rounded-xl border border-error-500/30 bg-badge-error-background px-4 py-3 text-sm text-badge-error-text">
            Não foi possível conectar: {params.message ?? "erro desconhecido"}.
          </div>
        )}
        <ContaAzulPanel data={data} />
      </div>
    </>
  );
}
