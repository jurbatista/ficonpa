"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { fieldClass, StatusBadge } from "@/components/app/ui";
import type { CatalogItem } from "@/lib/catalogs";
import { formatBRL, formatDateTime, formatPercent } from "@/lib/format";
import { Badge } from "@/components/tailgrids/core/badge";

export type PayableDetailData = {
  id: string;
  documentId: string;
  attachmentId: string;
  filename: string;
  status: string;
  origin: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierDocument: string | null;
  categoryId: string | null;
  financialAccountId: string | null;
  costCenterId: string | null;
  description: string | null;
  value: string | null;
  dueDate: string | null;
  competenceDate: string | null;
  error: string | null;
  postedAt: string | null;
  contaAzulEventId: string | null;
  createdAt: string;
  documentStatus: string;
  confidence: string | null;
  needsAttention: boolean;
  attentionReason: string | null;
  emailSubject: string | null;
  emailFrom: string | null;
  emailReceivedAt: string | null;
};

export function PayableDetail({
  data,
  catalogs,
}: {
  data: PayableDetailData;
  catalogs: {
    people: CatalogItem[];
    categories: CatalogItem[];
    financialAccounts: CatalogItem[];
    costCenters: CatalogItem[];
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    supplierId: data.supplierId ?? "",
    description: data.description ?? "",
    value: data.value ?? "",
    dueDate: data.dueDate ?? "",
    competenceDate: data.competenceDate ?? "",
    categoryId: data.categoryId ?? "",
    financialAccountId: data.financialAccountId ?? "",
    costCenterId: data.costCenterId ?? "",
  });
  const [busy, setBusy] = useState<"save" | "approve" | "reject" | null>(null);

  const isPosted = data.status === "POSTED";
  const isRejected = data.status === "REJECTED";
  const locked = isPosted || isRejected;

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const save = async () => {
    setBusy("save");
    try {
      const supplier = catalogs.people.find((item) => item.id === form.supplierId);
      const category = catalogs.categories.find((item) => item.id === form.categoryId);
      const account = catalogs.financialAccounts.find((item) => item.id === form.financialAccountId);
      const center = catalogs.costCenters.find((item) => item.id === form.costCenterId);

      const response = await fetch("/api/payables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: data.id,
          supplierId: form.supplierId || undefined,
          supplierName: supplier?.name,
          categoryId: form.categoryId || undefined,
          categoryName: category?.name,
          financialAccountId: form.financialAccountId || undefined,
          financialAccountName: account?.name,
          costCenterId: form.costCenterId || null,
          costCenterName: center?.name ?? null,
          description: form.description || undefined,
          value: form.value ? Number(form.value) : undefined,
          dueDate: form.dueDate || undefined,
          competenceDate: form.competenceDate || undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao salvar.");
      toast.success("Alterações salvas.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    setBusy("approve");
    try {
      const response = await fetch(`/api/payables/${data.id}/approve`, { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao aprovar.");
      toast.success("Lançamento enviado para a fila do Conta Azul.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao aprovar.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy("reject");
    try {
      const response = await fetch(`/api/payables/${data.id}/reject`, { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao rejeitar.");
      toast.success("Lançamento rejeitado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao rejeitar.");
    } finally {
      setBusy(null);
    }
  };

  const reprocess = async () => {
    setBusy("save");
    try {
      const response = await fetch(`/api/documents/${data.documentId}/reprocess`, {
        method: "POST",
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao reprocessar.");
      toast.success("Documento enviado para reprocessamento.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao reprocessar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-5 px-5 pb-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-7">
      <div className="space-y-5">
        <div className="rounded-xl border border-card-border bg-card-background p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-tertiary">Fornecedor</p>
              <p className="text-lg font-semibold text-text-primary">
                {data.supplierName ?? "Não identificado"}
              </p>
              <p className="text-xs text-text-tertiary">{data.supplierDocument ?? "Sem documento"}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={data.status} />
              <Badge color={data.origin === "auto" ? "violet" : "gray"} size="sm">
                {data.origin === "auto" ? "Automático" : "Manual"}
              </Badge>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-card-border pt-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-text-tertiary">Valor</dt>
              <dd className="font-semibold text-text-primary">{formatBRL(data.value)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Vencimento</dt>
              <dd className="text-text-primary">{data.dueDate ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Confiança</dt>
              <dd className="text-text-primary">{formatPercent(data.confidence)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Recebido em</dt>
              <dd className="text-text-primary">{formatDateTime(data.createdAt)}</dd>
            </div>
          </dl>

          {(data.needsAttention || data.error) && (
            <p className="mt-4 rounded-lg bg-badge-warning-background px-3 py-2 text-xs text-badge-warning-text">
              {data.attentionReason ?? data.error}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-card-border bg-card-background p-5">
          <h3 className="text-sm font-semibold text-text-primary">Dados do lançamento</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            Revise os campos antes de enviar ao Conta Azul.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Fornecedor</span>
              <select
                className={fieldClass}
                value={form.supplierId}
                onChange={set("supplierId")}
                disabled={locked}
              >
                <option value="">Selecione...</option>
                {catalogs.people.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.detail ? ` — ${item.detail}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Descrição</span>
              <input
                className={fieldClass}
                value={form.description}
                onChange={set("description")}
                disabled={locked}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Valor (R$)</span>
              <input
                className={fieldClass}
                value={form.value}
                onChange={set("value")}
                inputMode="decimal"
                disabled={locked}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Vencimento</span>
              <input
                type="date"
                className={fieldClass}
                value={form.dueDate}
                onChange={set("dueDate")}
                disabled={locked}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Competência</span>
              <input
                type="date"
                className={fieldClass}
                value={form.competenceDate}
                onChange={set("competenceDate")}
                disabled={locked}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Categoria</span>
              <select
                className={fieldClass}
                value={form.categoryId}
                onChange={set("categoryId")}
                disabled={locked}
              >
                <option value="">Selecione...</option>
                {catalogs.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Conta financeira</span>
              <select
                className={fieldClass}
                value={form.financialAccountId}
                onChange={set("financialAccountId")}
                disabled={locked}
              >
                <option value="">Selecione...</option>
                {catalogs.financialAccounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.detail ? ` — ${item.detail}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Centro de custo</span>
              <select
                className={fieldClass}
                value={form.costCenterId}
                onChange={set("costCenterId")}
                disabled={locked}
              >
                <option value="">Sem centro de custo</option>
                {catalogs.costCenters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-card-border pt-4">
            {!locked && (
              <>
                <button
                  onClick={save}
                  disabled={busy !== null}
                  className="rounded-lg border border-button-primary-outline-stroke px-4 py-2 text-sm font-medium text-button-primary-outline-text transition hover:bg-button-primary-outline-hover-background disabled:opacity-60"
                >
                  {busy === "save" ? "Salvando..." : "Salvar alterações"}
                </button>
                <button
                  onClick={approve}
                  disabled={busy !== null}
                  className="rounded-lg bg-button-primary-background px-4 py-2 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:opacity-60"
                >
                  {busy === "approve" ? "Enviando..." : "Aprovar e lançar"}
                </button>
                <button
                  onClick={reject}
                  disabled={busy !== null}
                  className="rounded-lg border border-button-error-outline-stroke px-4 py-2 text-sm font-medium text-button-error-outline-text transition hover:bg-button-error-outline-hover-background disabled:opacity-60"
                >
                  {busy === "reject" ? "Rejeitando..." : "Rejeitar"}
                </button>
              </>
            )}
            <button
              onClick={reprocess}
              disabled={busy !== null}
              className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary disabled:opacity-60"
            >
              Reprocessar documento
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border border-card-border bg-card-background p-5">
          <h3 className="text-sm font-semibold text-text-primary">Boleto original</h3>
          <p className="mt-0.5 truncate text-xs text-text-secondary">{data.filename}</p>
          <a
            href={`/api/attachments/${data.attachmentId}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex rounded-lg border border-card-border px-3.5 py-2 text-xs font-medium text-text-secondary transition hover:text-text-primary"
          >
            Abrir PDF em nova aba
          </a>
          <iframe
            src={`/api/attachments/${data.attachmentId}`}
            className="mt-3 h-[420px] w-full rounded-lg border border-card-border"
            title="Pré-visualização do boleto"
          />
        </div>

        <div className="rounded-xl border border-card-border bg-card-background p-5">
          <h3 className="text-sm font-semibold text-text-primary">Origem</h3>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-text-tertiary">Assunto</dt>
              <dd className="text-text-primary">{data.emailSubject ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Remetente</dt>
              <dd className="break-all text-text-primary">{data.emailFrom ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Recebido no e-mail</dt>
              <dd className="text-text-primary">{formatDateTime(data.emailReceivedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Status do documento</dt>
              <dd className="text-text-primary">{data.documentStatus}</dd>
            </div>
          </dl>
        </div>

        {isPosted && (
          <div className="rounded-xl border border-success-500/30 bg-badge-success-background p-5">
            <h3 className="text-sm font-semibold text-badge-success-text">Lançado no Conta Azul</h3>
            <p className="mt-1 text-xs text-badge-success-text">
              Em {formatDateTime(data.postedAt)} · ID {data.contaAzulEventId ?? "—"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
