"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { btnOutline, btnPrimary, btnText, fieldClass } from "@/components/app/ui";
import { Card } from "@/components/tailgrids/core/card";
import type { CatalogItem } from "@/lib/catalogs";
import { formatDateTime, formatWhen, parseBRL, senderName, toInputBRL } from "@/lib/format";

export type PayableDetailData = {
  id: string;
  documentId: string;
  attachmentId: string;
  status: string;
  auto: boolean;
  supplierId: string | null;
  categoryId: string | null;
  financialAccountId: string | null;
  costCenterId: string | null;
  description: string | null;
  value: string | null;
  dueDate: string | null;
  competenceDate: string | null;
  postedAt: string | null;
  /** O que impede o lançamento, em uma frase. */
  note: string | null;
  emailSubject: string | null;
  emailFrom: string | null;
  emailReceivedAt: string;
};

type Catalogs = {
  people: CatalogItem[];
  categories: CatalogItem[];
  financialAccounts: CatalogItem[];
  costCenters: CatalogItem[];
};

type Busy = "save" | "launch" | "discard" | "restore" | "reread" | null;

async function send(path: string, method: "POST" | "PATCH", body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Não deu certo. Tente de novo.");
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block font-medium text-text-primary">{label}</span>
      {children}
    </label>
  );
}

export function PayableDetail({ data, catalogs }: { data: PayableDetailData; catalogs: Catalogs }) {
  const router = useRouter();
  const saved = {
    supplierId: data.supplierId ?? "",
    value: toInputBRL(data.value),
    dueDate: data.dueDate ?? "",
    categoryId: data.categoryId ?? "",
    financialAccountId: data.financialAccountId ?? "",
    costCenterId: data.costCenterId ?? "",
    competenceDate: data.competenceDate ?? "",
    description: data.description ?? "",
  };
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState<Busy>(null);

  const posted = data.status === "POSTED";
  const posting = data.status === "APPROVED";
  const discarded = data.status === "REJECTED";
  const locked = posted || posting || discarded;
  const dirty = (Object.keys(saved) as (keyof typeof saved)[]).some((key) => saved[key] !== form[key]);

  // Enquanto o lançamento está a caminho do Conta Azul, acompanha até terminar.
  useEffect(() => {
    if (!posting) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [posting, router]);

  const set =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const run = async (action: Exclude<Busy, null>, work: () => Promise<void>, success: string) => {
    setBusy(action);
    try {
      await work();
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu certo. Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    const name = (list: CatalogItem[], id: string) => list.find((item) => item.id === id)?.name;
    return send("/api/payables", "PATCH", {
      id: data.id,
      supplierId: form.supplierId || undefined,
      supplierName: name(catalogs.people, form.supplierId),
      categoryId: form.categoryId || undefined,
      categoryName: name(catalogs.categories, form.categoryId),
      financialAccountId: form.financialAccountId || undefined,
      financialAccountName: name(catalogs.financialAccounts, form.financialAccountId),
      costCenterId: form.costCenterId || null,
      costCenterName: name(catalogs.costCenters, form.costCenterId) ?? null,
      description: form.description || undefined,
      value: parseBRL(form.value) ?? undefined,
      dueDate: form.dueDate || undefined,
      competenceDate: form.competenceDate || form.dueDate || undefined,
    });
  };

  const launch = () => {
    const missing = [
      !form.supplierId && "fornecedor",
      parseBRL(form.value) === null && "valor",
      !form.dueDate && "vencimento",
      !form.categoryId && "categoria",
      !form.financialAccountId && "conta",
    ].filter(Boolean);
    if (missing.length > 0) {
      toast.error(`Falta preencher: ${missing.join(", ")}.`);
      return;
    }
    void run(
      "launch",
      async () => {
        await save();
        await send(`/api/payables/${data.id}/approve`, "POST");
      },
      "Lançando no Conta Azul…",
    );
  };

  const reread = () => {
    if (!window.confirm("Ler o boleto de novo? O que foi alterado aqui será substituído.")) return;
    void run("reread", () => send(`/api/documents/${data.documentId}/reprocess`, "POST"), "Lendo o boleto de novo…");
  };

  return (
    <div className="grid items-start gap-5 px-5 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:px-7">
      <Card className="p-5">
        {data.note && !locked && (
          <p className="mb-5 rounded-lg bg-badge-warning-background px-3.5 py-2.5 text-sm text-badge-warning-text">
            {data.note}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fornecedor" wide>
            <select className={fieldClass} value={form.supplierId} onChange={set("supplierId")} disabled={locked}>
              <option value="">Escolha…</option>
              {catalogs.people.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.detail ? ` — ${item.detail}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Valor (R$)">
            <input className={fieldClass} value={form.value} onChange={set("value")} inputMode="decimal" disabled={locked} />
          </Field>
          <Field label="Vencimento">
            <input type="date" className={fieldClass} value={form.dueDate} onChange={set("dueDate")} disabled={locked} />
          </Field>

          <Field label="Categoria">
            <select className={fieldClass} value={form.categoryId} onChange={set("categoryId")} disabled={locked}>
              <option value="">Escolha…</option>
              {catalogs.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Conta">
            <select
              className={fieldClass}
              value={form.financialAccountId}
              onChange={set("financialAccountId")}
              disabled={locked}
            >
              <option value="">Escolha…</option>
              {catalogs.financialAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Centro de custo">
            <select className={fieldClass} value={form.costCenterId} onChange={set("costCenterId")} disabled={locked}>
              <option value="">Nenhum</option>
              {catalogs.costCenters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Competência">
            <input
              type="date"
              className={fieldClass}
              value={form.competenceDate}
              onChange={set("competenceDate")}
              disabled={locked}
            />
          </Field>

          <Field label="Descrição" wide>
            <input className={fieldClass} value={form.description} onChange={set("description")} disabled={locked} />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-card-border pt-5">
          {posted && (
            <p className="text-sm text-text-secondary">
              Lançado no Conta Azul em {formatDateTime(data.postedAt)}
              {data.auto ? ", automaticamente" : ""}.
            </p>
          )}
          {posting && <p className="text-sm text-text-secondary">Lançando no Conta Azul…</p>}
          {discarded && (
            <button
              className={btnOutline}
              disabled={busy !== null}
              onClick={() => run("restore", () => send(`/api/payables/${data.id}/restore`, "POST"), "Boleto restaurado.")}
            >
              {busy === "restore" ? "Restaurando…" : "Restaurar"}
            </button>
          )}
          {!locked && (
            <>
              <button className={btnPrimary} disabled={busy !== null} onClick={launch}>
                {busy === "launch" ? "Enviando…" : "Lançar no Conta Azul"}
              </button>
              <button
                className={btnOutline}
                disabled={busy !== null || !dirty}
                onClick={() => run("save", save, "Salvo.")}
              >
                {busy === "save" ? "Salvando…" : "Salvar"}
              </button>
              <button
                className={`${btnText} ml-auto`}
                disabled={busy !== null}
                onClick={() => run("discard", () => send(`/api/payables/${data.id}/reject`, "POST"), "Descartado.")}
              >
                Descartar
              </button>
            </>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <iframe
          src={`/api/attachments/${data.attachmentId}`}
          className="h-[460px] w-full rounded-lg border border-card-border bg-white"
          title="Boleto"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <a href={`/api/attachments/${data.attachmentId}`} target="_blank" rel="noreferrer" className={btnText}>
            Abrir PDF
          </a>
          {!locked && (
            <button className={btnText} disabled={busy !== null} onClick={reread}>
              {busy === "reread" ? "Enviando…" : "Ler de novo"}
            </button>
          )}
        </div>
        <p className="mt-4 border-t border-card-border pt-4 text-xs leading-5 text-text-tertiary">
          {data.emailSubject && <span className="block truncate text-text-secondary">{data.emailSubject}</span>}
          <span className="block truncate">
            {[senderName(data.emailFrom), formatWhen(data.emailReceivedAt)].filter(Boolean).join(" · ")}
          </span>
        </p>
      </Card>
    </div>
  );
}
