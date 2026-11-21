"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Section, StatCard } from "@/components/app/ui";
import { formatDateTime } from "@/lib/format";

export type ContaAzulView = {
  configured: boolean;
  connected: boolean;
  companyName: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  catalogs: {
    people: number;
    categories: number;
    financialAccounts: number;
    costCenters: number;
  } | null;
};

export function ContaAzulPanel({ data }: { data: ContaAzulView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const sync = async () => {
    setBusy("sync");
    try {
      const response = await fetch("/api/conta-azul/sync", { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao sincronizar.");
      toast.success("Cadastros sincronizados.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Desconectar o Conta Azul? Os lançamentos pendentes não serão enviados.")) {
      return;
    }
    setBusy("disconnect");
    try {
      const response = await fetch("/api/conta-azul/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Falha ao desconectar.");
      toast.success("Conta Azul desconectado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao desconectar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Section
        title="Conexão"
        description="Autorize o ficonpa a criar contas a pagar na sua empresa."
        actions={
          data.connected ? (
            <div className="flex items-center gap-2">
              <button
                onClick={sync}
                disabled={busy !== null}
                className="rounded-lg border border-button-primary-outline-stroke px-4 py-2 text-sm font-medium text-button-primary-outline-text transition hover:bg-button-primary-outline-hover-background disabled:opacity-60"
              >
                {busy === "sync" ? "Sincronizando..." : "Sincronizar cadastros"}
              </button>
              <button
                onClick={disconnect}
                disabled={busy !== null}
                className="rounded-lg border border-button-error-outline-stroke px-4 py-2 text-sm font-medium text-button-error-outline-text transition hover:bg-button-error-outline-hover-background disabled:opacity-60"
              >
                Desconectar
              </button>
            </div>
          ) : (
            <a
              href="/api/conta-azul/connect"
              className={
                data.configured
                  ? "rounded-lg bg-button-primary-background px-4 py-2 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background"
                  : "pointer-events-none rounded-lg bg-button-primary-background px-4 py-2 text-sm font-medium text-button-primary-text opacity-50"
              }
            >
              Conectar Conta Azul
            </a>
          )
        }
      >
        {!data.configured && (
          <div className="mb-4 rounded-lg border border-warning-500/30 bg-badge-warning-background px-4 py-3 text-sm text-badge-warning-text">
            Defina <code>CONTA_AZUL_CLIENT_ID</code>, <code>CONTA_AZUL_CLIENT_SECRET</code> e{" "}
            <code>CONTA_AZUL_REDIRECT_URI</code> no ambiente para habilitar a conexão.
          </div>
        )}

        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-text-tertiary">Status</dt>
            <dd className="text-sm font-medium text-text-primary">
              {data.connected ? "Conectado" : "Não conectado"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-tertiary">Empresa</dt>
            <dd className="text-sm font-medium text-text-primary">{data.companyName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-tertiary">Token válido até</dt>
            <dd className="text-sm font-medium text-text-primary">
              {data.expiresAt ? formatDateTime(data.expiresAt) : "—"}
            </dd>
          </div>
        </dl>
      </Section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pessoas" value={data.catalogs?.people ?? 0} hint="Fornecedores e clientes" />
        <StatCard label="Categorias" value={data.catalogs?.categories ?? 0} hint="Plano de contas" />
        <StatCard
          label="Contas financeiras"
          value={data.catalogs?.financialAccounts ?? 0}
          hint="Bancos e caixas"
        />
        <StatCard
          label="Centros de custo"
          value={data.catalogs?.costCenters ?? 0}
          hint="Rateios disponíveis"
        />
      </div>

      <div className="rounded-xl border border-card-border bg-card-background p-5 text-sm text-text-secondary">
        <p className="font-medium text-text-primary">Como o lançamento é feito</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
          <li>Uma única empresa do Conta Azul é usada por instalação.</li>
          <li>
            O lançamento usa <code>POST /v1/financeiro/contas-a-pagar</code> com{" "}
            <code>referencia_externa</code> para evitar duplicidade.
          </li>
          <li>O match de fornecedor considera qualquer pessoa cadastrada (CNPJ ou nome).</li>
          <li>Tokens são criptografados com AES-256-GCM e renovados automaticamente.</li>
        </ul>
      </div>
    </div>
  );
}
