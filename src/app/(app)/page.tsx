import Link from "next/link";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { DocumentActions } from "@/components/app/document-actions";
import {
  btnOutline,
  btnPrimary,
  btnSmall,
  EmptyState,
  fieldClass,
  PageHeader,
  StatusBadge,
} from "@/components/app/ui";
import { Card } from "@/components/tailgrids/core/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from "@/components/tailgrids/core/table";
import {
  getOverview,
  listBoletos,
  type BoletoRow,
  type BoletoView,
  type Overview,
} from "@/lib/boletos";
import {
  formatBRL,
  formatDate,
  formatDocument,
  formatWhen,
  isOverdue,
  senderName,
} from "@/lib/format";
import { cn } from "@/utils/cn";

export const dynamic = "force-dynamic";

const TABS: { key: BoletoView; label: string }[] = [
  { key: "revisar", label: "Para revisar" },
  { key: "lancados", label: "Lançados" },
  { key: "descartados", label: "Descartados" },
];

const EMPTY: Record<BoletoView, string> = {
  revisar: "Nada para revisar.",
  lancados: "Nenhum boleto lançado ainda.",
  descartados: "Nada descartado.",
};

function listHref(view: BoletoView, search?: string): string {
  const query = new URLSearchParams();
  if (view !== "revisar") query.set("tab", view);
  if (search) query.set("q", search);
  return query.size > 0 ? `/?${query.toString()}` : "/";
}

function statusLine(overview: Overview): string | null {
  if (overview.mailboxes === 0) return null;
  const who = overview.mailbox ?? `${overview.mailboxes} caixas de e-mail`;
  return overview.lastCheckAt
    ? `${who} · última busca ${formatWhen(overview.lastCheckAt)}`
    : `${who} · primeira busca em andamento`;
}

function Step({
  number,
  title,
  done,
  detail,
  action,
}: {
  number: number;
  title: string;
  done: boolean;
  detail?: string | null;
  action: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3.5 py-4 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          done
            ? "bg-badge-success-background text-badge-success-text"
            : "bg-background-gray-secondary_alt text-text-secondary",
        )}
      >
        {done ? "✓" : number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {detail && <p className="truncate text-xs text-text-tertiary">{detail}</p>}
      </div>
      {!done && action}
    </li>
  );
}

function Setup({ overview }: { overview: Overview }) {
  const contaAzul = overview.contaAzulConnected;
  const mailbox = overview.mailboxes > 0;
  return (
    <Card className="max-w-2xl p-6">
      <h2 className="text-base font-semibold text-text-primary">Para começar</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Conecte o Conta Azul e a caixa de e-mail. Os boletos que chegarem aparecem aqui, prontos
        para lançar.
      </p>
      <ol className="mt-6 divide-y divide-card-border">
        <Step
          number={1}
          title="Conta Azul"
          done={contaAzul}
          detail={contaAzul ? "Conectado" : null}
          action={
            <a
              href={overview.contaAzulConfigured ? "/api/conta-azul/connect" : "/conexoes/conta-azul"}
              className={btnPrimary}
            >
              Conectar
            </a>
          }
        />
        <Step
          number={2}
          title="Caixa de e-mail"
          done={mailbox}
          detail={mailbox ? (overview.mailbox ?? `${overview.mailboxes} caixas conectadas`) : null}
          action={
            <Link href="/conexoes/emails" className={contaAzul ? btnPrimary : btnOutline}>
              Conectar
            </Link>
          }
        />
      </ol>
    </Card>
  );
}

function Notices({ items }: { items: { text: string; href: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-warning-500/20 rounded-xl border border-warning-500/30 bg-badge-warning-background text-sm text-badge-warning-text">
      {items.map((item) => (
        <li key={item.href} className="flex items-center justify-between gap-4 px-4 py-2.5">
          <span>{item.text}</span>
          <Link href={item.href} className="shrink-0 font-semibold underline underline-offset-2">
            Ver
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Supplier({ row }: { row: BoletoRow }) {
  const name = row.supplierName ?? senderName(row.emailFrom) ?? "Boleto sem fornecedor";
  const second = row.note ?? formatDocument(row.supplierDocument) ?? row.emailSubject;
  const nameClass = "block truncate text-sm font-medium text-text-primary hover:underline";

  return (
    <>
      {row.payableId ? (
        <Link href={`/contas-a-pagar/${row.payableId}`} className={nameClass}>
          {name}
        </Link>
      ) : (
        <a
          href={`/api/attachments/${row.attachmentId}`}
          target="_blank"
          rel="noreferrer"
          className={nameClass}
        >
          {name}
        </a>
      )}
      <p className={cn("truncate text-xs", row.note ? "text-badge-warning-text" : "text-text-tertiary")}>
        {second}
      </p>
    </>
  );
}

function BoletoTable({ rows, view }: { rows: BoletoRow[]; view: BoletoView }) {
  return (
    <TableRoot fullBleed className="border-0">
      <TableHeader>
        <TableRow>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>{view === "lancados" ? "Lançado" : "Situação"}</TableHead>
          {view === "revisar" && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="w-full max-w-0">
              <Supplier row={row} />
            </TableCell>
            <TableCell
              className={cn(
                "text-sm whitespace-nowrap",
                view === "revisar" && isOverdue(row.dueDate) && "text-badge-error-text",
              )}
            >
              {formatDate(row.dueDate)}
            </TableCell>
            <TableCell className="text-right text-sm font-semibold whitespace-nowrap text-text-primary">
              {formatBRL(row.value)}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {view === "lancados" ? (
                <span className="text-xs text-text-tertiary">
                  {formatWhen(row.postedAt)}
                  {row.auto ? " · automático" : ""}
                </span>
              ) : (
                <StatusBadge status={row.status} />
              )}
            </TableCell>
            {view === "revisar" && (
              <TableCell className="text-right whitespace-nowrap">
                {!row.payableId ? (
                  <DocumentActions documentId={row.documentId} />
                ) : row.status !== "APPROVED" ? (
                  <Link href={`/contas-a-pagar/${row.payableId}`} className={btnSmall}>
                    Revisar
                  </Link>
                ) : null}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </TableRoot>
  );
}

/** Em telas estreitas a tabela não cabe: cada boleto vira um bloco. */
function BoletoCards({ rows, view }: { rows: BoletoRow[]; view: BoletoView }) {
  return (
    <ul className="divide-y divide-card-border">
      {rows.map((row) => {
        const name = row.supplierName ?? senderName(row.emailFrom) ?? "Boleto sem fornecedor";
        const head = (
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium text-text-primary">{name}</span>
            <span className="shrink-0 text-sm font-semibold text-text-primary">{formatBRL(row.value)}</span>
          </span>
        );
        return (
          <li key={row.key} className="px-4 py-3.5">
            {row.payableId ? (
              <Link href={`/contas-a-pagar/${row.payableId}`} className="block">
                {head}
              </Link>
            ) : (
              <a href={`/api/attachments/${row.attachmentId}`} target="_blank" rel="noreferrer" className="block">
                {head}
              </a>
            )}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
              {view === "lancados" ? (
                <span>
                  Lançado {formatWhen(row.postedAt)}
                  {row.auto ? " · automático" : ""}
                </span>
              ) : (
                <>
                  <StatusBadge status={row.status} />
                  {row.dueDate && (
                    <span className={cn(view === "revisar" && isOverdue(row.dueDate) && "text-badge-error-text")}>
                      vence {formatDate(row.dueDate)}
                    </span>
                  )}
                </>
              )}
            </p>
            {row.note && <p className="mt-1.5 text-xs text-badge-warning-text">{row.note}</p>}
            {view === "revisar" && !row.payableId && (
              <div className="mt-2.5 flex justify-start">
                <DocumentActions documentId={row.documentId} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function BoletosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const params = await searchParams;
  const view = TABS.find((tab) => tab.key === params.tab)?.key ?? "revisar";
  const search = params.q?.trim() || undefined;

  const [overview, rows] = await Promise.all([getOverview(), listBoletos(view, search)]);
  const ready = overview.contaAzulConnected && overview.mailboxes > 0;
  const hasBoletos = Object.values(overview.counts).some((total) => total > 0);
  const notices: { text: string; href: string }[] = [];
  if (overview.mailboxWithError) {
    notices.push({
      text: `A caixa ${overview.mailboxWithError} parou de conectar.`,
      href: "/conexoes/emails",
    });
  }
  if (overview.stuckLinks > 0) {
    notices.push({
      text:
        overview.stuckLinks === 1
          ? "1 boleto veio por link e não foi baixado."
          : `${overview.stuckLinks} boletos vieram por link e não foram baixados.`,
      href: "/conexoes/links",
    });
  }
  const tabs = TABS.filter(
    (tab) => tab.key !== "descartados" || overview.counts.descartados > 0 || view === "descartados",
  );

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Boletos"
        description={statusLine(overview)}
        actions={
          hasBoletos && (
            <form action="/" role="search" className="w-full sm:w-auto">
              {view !== "revisar" && <input type="hidden" name="tab" value={view} />}
              <input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Buscar"
                aria-label="Buscar boleto"
                className={cn(fieldClass, "py-2 sm:w-60")}
              />
            </form>
          )
        }
      />

      <div className="space-y-4 px-5 pb-8 lg:px-7">
        {!ready && <Setup overview={overview} />}

        {view === "revisar" && <Notices items={notices} />}

        {hasBoletos ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav
                aria-label="Situação dos boletos"
                className="flex max-w-full gap-1 overflow-x-auto rounded-xl border-[0.5px] border-card-border bg-card-background p-1"
              >
                {tabs.map((tab) => (
                  <Link
                    key={tab.key}
                    href={listHref(tab.key, search)}
                    aria-current={view === tab.key ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition sm:px-3.5",
                      view === tab.key
                        ? "bg-background-gray-secondary_alt text-text-primary"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {tab.label}
                    {tab.key === "revisar" && overview.counts.revisar > 0 && (
                      <span className="rounded-full bg-button-primary-background px-1.5 text-[11px] leading-[18px] font-semibold text-white">
                        {overview.counts.revisar}
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
              {!overview.autoPost && (
                <p className="text-xs text-text-tertiary">
                  Lançamento automático desligado ·{" "}
                  <Link href="/configuracoes" className="underline underline-offset-2 hover:text-text-primary">
                    ligar
                  </Link>
                </p>
              )}
            </div>

            <Card className="overflow-hidden p-0">
              {rows.length === 0 ? (
                <EmptyState>{search ? `Nada encontrado para “${search}”.` : EMPTY[view]}</EmptyState>
              ) : (
                <>
                  <div className="hidden sm:block">
                    <BoletoTable rows={rows} view={view} />
                  </div>
                  <div className="sm:hidden">
                    <BoletoCards rows={rows} view={view} />
                  </div>
                </>
              )}
            </Card>
          </>
        ) : (
          ready && (
            <Card className="max-w-2xl p-6">
              <p className="text-base font-semibold text-text-primary">Tudo pronto.</p>
              <p className="mt-1 text-sm text-text-secondary">
                Os boletos que chegarem no e-mail aparecem aqui.
              </p>
            </Card>
          )
        )}
      </div>
    </>
  );
}
