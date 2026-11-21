import Link from "next/link";
import { EmptyState, PageHeader, Section, StatusBadge } from "@/components/app/ui";
import { ReprocessButton } from "@/components/app/reprocess-button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from "@/components/tailgrids/core/table";
import { Badge } from "@/components/tailgrids/core/badge";
import { listAttentionDocuments, listPayables } from "@/lib/queries";
import { formatBRL, formatDateTime, formatPercent } from "@/lib/format";
import { cn } from "@/utils/cn";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "todos", label: "Todos" },
  { key: "pendentes", label: "Na fila" },
  { key: "lancados", label: "Lançados" },
  { key: "rejeitados", label: "Rejeitados" },
  { key: "atencao", label: "Precisa de atenção" },
] as const;

type SearchParams = Promise<{ tab?: string; q?: string }>;

export default async function PayablesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab = TABS.some((item) => item.key === params.tab) ? params.tab! : "todos";
  const search = params.q?.trim() || undefined;

  const isAttention = tab === "atencao";
  const statuses =
    tab === "pendentes"
      ? ["DRAFT", "APPROVED", "FAILED"]
      : tab === "lancados"
        ? ["POSTED"]
        : tab === "rejeitados"
          ? ["REJECTED"]
          : undefined;

  const [rows, attention] = await Promise.all([
    isAttention
      ? Promise.resolve([])
      : listPayables({ statuses, search, limit: 200 }),
    isAttention ? listAttentionDocuments(200) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        description="Boletos que passaram pela triagem e lançamentos enviados ao Conta Azul."
        actions={
          <form action="/contas-a-pagar" className="flex items-center gap-2">
            <input type="hidden" name="tab" value={tab} />
            <input
              name="q"
              defaultValue={search}
              placeholder="Buscar fornecedor, valor..."
              className="w-56 rounded-lg border border-card-border bg-input-background px-3.5 py-2 text-sm text-title-50 outline-none focus:border-input-primary-focus-border focus:ring-4 focus:ring-input-primary-focus-border/20"
            />
            <button
              type="submit"
              className="rounded-lg border border-button-primary-outline-stroke px-3.5 py-2 text-sm font-medium text-button-primary-outline-text transition hover:bg-button-primary-outline-hover-background"
            >
              Buscar
            </button>
          </form>
        }
      />

      <div className="space-y-5 px-5 pb-8 lg:px-7">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-card-border bg-card-background p-1.5">
          {TABS.map((item) => (
            <Link
              key={item.key}
              href={`/contas-a-pagar?tab=${item.key}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
              className={cn(
                "rounded-lg px-3.5 py-2 text-sm font-medium transition",
                tab === item.key
                  ? "bg-background-gray-primary text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {isAttention ? (
          <Section
            title="Documentos que precisam de atenção"
            description="Sem fornecedor identificado, erro de processamento ou classificação pendente."
          >
            {attention.length === 0 ? (
              <EmptyState
                title="Nada pendente"
                description="Todos os documentos recentes foram triados com sucesso."
              />
            ) : (
              <TableRoot fullBleed className="border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Confiança</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Recebido</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attention.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="max-w-[240px] truncate text-sm font-medium text-text-primary">
                          {row.filename}
                        </p>
                        <p className="text-xs text-text-tertiary">{row.status}</p>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[220px] truncate text-xs text-text-secondary">
                          {row.emailSubject ?? "Sem assunto"}
                        </p>
                        <p className="max-w-[220px] truncate text-xs text-text-tertiary">
                          {row.emailFrom ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell>{formatPercent(row.confidence)}</TableCell>
                      <TableCell>
                        <p className="max-w-[280px] text-xs text-text-secondary">
                          {row.attentionReason ?? row.error ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-text-tertiary">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <a
                            href={`/api/attachments/${row.attachmentId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
                          >
                            PDF
                          </a>
                          <ReprocessButton documentId={row.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableRoot>
            )}
          </Section>
        ) : (
          <Section
            title={`${rows.length} lançamento${rows.length === 1 ? "" : "s"}`}
            description="Clique em um item para revisar, editar e aprovar."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="Nenhum lançamento nesta visão"
                description="Ajuste os filtros ou aguarde a chegada de novos boletos."
              />
            ) : (
              <TableRoot fullBleed className="border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="text-sm font-medium text-text-primary">
                          {row.supplierName ?? "Sem fornecedor"}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {row.supplierDocument ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[260px] truncate text-sm text-text-secondary">
                          {row.description ?? "—"}
                        </p>
                        {row.needsAttention && row.attentionReason && (
                          <p className="max-w-[260px] truncate text-xs text-warning-500">
                            {row.attentionReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{row.dueDate ?? "—"}</TableCell>
                      <TableCell className="font-semibold text-text-primary">
                        {formatBRL(row.value)}
                      </TableCell>
                      <TableCell>
                        <Badge color={row.origin === "auto" ? "violet" : "gray"} size="sm">
                          {row.origin === "auto" ? "Automático" : "Manual"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-xs text-text-tertiary">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/contas-a-pagar/${row.id}`}
                          className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
                        >
                          Abrir
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableRoot>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
