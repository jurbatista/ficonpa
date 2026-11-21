import Link from "next/link";
import { AutoPostToggle } from "@/components/app/auto-post-toggle";
import { EmptyState, PageHeader, Section, StatCard, StatusBadge } from "@/components/app/ui";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from "@/components/tailgrids/core/table";
import { getDashboardStats, getRecentActivity } from "@/lib/queries";
import { formatBRL, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, recent] = await Promise.all([getDashboardStats(), getRecentActivity(8)]);

  return (
    <>
      <PageHeader
        title="Painel"
        description="Acompanhe a importação de boletos e os lançamentos no Conta Azul."
        actions={
          <Link
            href="/contas-a-pagar"
            className="rounded-lg bg-button-primary-background px-4 py-2.5 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background"
          >
            Ver contas a pagar
          </Link>
        }
      />

      <div className="space-y-5 px-5 pb-8 lg:px-7">
        <AutoPostToggle enabled={stats.autoPostEnabled} />

        {stats.emailAccounts === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-500/30 bg-badge-warning-background px-4 py-3">
            <p className="text-sm text-badge-warning-text">
              Nenhuma caixa de e-mail conectada. Conecte uma conta IMAP para começar a importar
              boletos.
            </p>
            <Link
              href="/conexoes/emails"
              className="text-sm font-semibold text-badge-warning-text underline underline-offset-2"
            >
              Conectar e-mail
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Na fila"
            value={stats.pending}
            hint="Rascunhos, aprovados e falhas"
            tone="info"
          />
          <StatCard
            label="Lançados"
            value={stats.posted}
            hint="Enviados ao Conta Azul"
            tone="success"
          />
          <StatCard
            label="Precisa de atenção"
            value={stats.attention}
            hint="Sem fornecedor, erro ou revisão"
            tone={stats.attention > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Total no período"
            value={stats.total}
            hint={`Retenção de ${stats.retentionDays} dias`}
          />
        </div>

        <Section
          title="Atividade recente"
          description="Últimos documentos processados"
          actions={
            <Link href="/contas-a-pagar" className="text-xs font-medium text-primary-500">
              Ver tudo
            </Link>
          }
        >
          {recent.length === 0 ? (
            <EmptyState
              title="Nenhum documento processado ainda"
              description="Assim que um boleto chegar nas caixas conectadas, ele aparecerá aqui."
              action={
                <Link
                  href="/conexoes/emails"
                  className="rounded-lg border border-button-primary-outline-stroke px-3.5 py-2 text-sm font-medium text-button-primary-outline-text"
                >
                  Configurar e-mails
                </Link>
              }
            />
          ) : (
            <TableRoot fullBleed className="border-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recebido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="max-w-[280px]">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {row.filename}
                        </p>
                        <p className="truncate text-xs text-text-tertiary">
                          {row.emailSubject ?? "Sem assunto"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{row.supplierName ?? "—"}</TableCell>
                    <TableCell>{row.dueDate ?? "—"}</TableCell>
                    <TableCell>{formatBRL(row.value)}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-xs text-text-tertiary">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </TableRoot>
          )}
        </Section>
      </div>
    </>
  );
}
