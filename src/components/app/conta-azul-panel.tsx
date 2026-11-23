"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { btnPrimary, btnSmall, btnText } from "@/components/app/ui";
import { Card } from "@/components/tailgrids/core/card";
import { formatWhen } from "@/lib/format";

export type ContaAzulView = {
  configured: boolean;
  connected: boolean;
  companyName: string | null;
  catalogs: {
    people: number;
    categories: number;
    financialAccounts: number;
    syncedAt: string | null;
  } | null;
};

const number = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

export function ContaAzulPanel({
  data,
  notice,
}: {
  data: ContaAzulView;
  notice?: { type: "ok" | "erro"; message: string | null } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const noticeShown = useRef(false);

  // Resultado da autorização no Conta Azul (volta por parâmetro na URL).
  useEffect(() => {
    if (!notice || noticeShown.current) return;
    noticeShown.current = true;
    if (notice.type === "ok") {
      toast.success("Conta Azul conectado.");
      if (notice.message) toast.warning(notice.message, { duration: 12_000 });
    } else {
      toast.error(notice.message ?? "Não foi possível conectar.", { duration: 12_000 });
    }
    router.replace("/conexoes/conta-azul");
  }, [notice, router]);

  const sync = async () => {
    setBusy("sync");
    try {
      const response = await fetch("/api/conta-azul/sync", { method: "POST" });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        data?: { warnings?: string[] };
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Não foi possível atualizar.");
      const warnings = payload.data?.warnings ?? [];
      if (warnings.length > 0) toast.warning(warnings.join(" "), { duration: 12_000 });
      else toast.success("Cadastros atualizados.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar.", { duration: 10_000 });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Desconectar o Conta Azul? Nenhum boleto será lançado até conectar de novo.")) return;
    setBusy("disconnect");
    try {
      const response = await fetch("/api/conta-azul/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível desconectar.");
      toast.success("Conta Azul desconectado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desconectar.");
    } finally {
      setBusy(null);
    }
  };

  if (!data.connected) {
    return (
      <Card className="max-w-2xl p-6">
        {data.configured ? (
          <>
            <p className="text-sm text-text-secondary">
              Autorize o ficonpa a lançar contas a pagar na sua empresa.
            </p>
            <a href="/api/conta-azul/connect" className={`${btnPrimary} mt-4`}>
              Conectar Conta Azul
            </a>
          </>
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              Falta informar os dados do aplicativo da Conta Azul.
            </p>
            <Link href="/configuracoes#conta-azul" className={`${btnPrimary} mt-4`}>
              Abrir Configurações
            </Link>
          </>
        )}
      </Card>
    );
  }

  const catalogs = data.catalogs;
  const incomplete = catalogs && (catalogs.categories === 0 || catalogs.financialAccounts === 0);

  return (
    <Card className="max-w-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <span aria-hidden className="size-2 rounded-full bg-success-500" />
          Conectado{data.companyName ? ` · ${data.companyName}` : ""}
        </p>
        <button className={btnText} disabled={busy !== null} onClick={disconnect}>
          Desconectar
        </button>
      </div>

      {catalogs && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-card-border pt-5">
          <div className="min-w-0 text-sm text-text-secondary">
            <p>
              {number(catalogs.people)} fornecedores e clientes · {number(catalogs.categories)} categorias ·{" "}
              {number(catalogs.financialAccounts)} contas
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {catalogs.syncedAt ? `Atualizado ${formatWhen(catalogs.syncedAt)}` : "Ainda não atualizado"}
            </p>
          </div>
          <button className={btnSmall} disabled={busy !== null} onClick={sync}>
            {busy === "sync" ? "Atualizando…" : "Atualizar agora"}
          </button>
        </div>
      )}

      {incomplete && (
        <p className="mt-4 rounded-lg bg-badge-warning-background px-3.5 py-2.5 text-sm text-badge-warning-text">
          Categorias ou contas ainda não vieram do Conta Azul. Sem elas o boleto não é lançado.
        </p>
      )}
    </Card>
  );
}
