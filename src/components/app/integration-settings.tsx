"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { fieldClass, Section } from "@/components/app/ui";

type Source = "database" | "environment" | null;

export type IntegrationSettingsData = {
  openrouterApiKey: string | null;
  contaAzulClientId: string | null;
  contaAzulClientSecret: string | null;
  contaAzulRedirectUri: string;
  microsoftClientId: string | null;
  microsoftClientSecret: string | null;
  microsoftRedirectUri: string;
  status: {
    openrouterApiKey: Source;
    contaAzulClientId: Source;
    contaAzulClientSecret: Source;
    contaAzulRedirectUri: Source;
  };
};

function sourceLabel(source: Source): string {
  if (source === "database") return "Salvo neste sistema";
  if (source === "environment") return "Vindo de variável de ambiente";
  return "Não configurado";
}

function sourceClass(source: Source): string {
  if (source === "database") return "text-success-500";
  if (source === "environment") return "text-info-500";
  return "text-text-tertiary";
}

export function IntegrationSettings({ data }: { data: IntegrationSettingsData }) {
  const router = useRouter();
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [clearOpenrouterApiKey, setClearOpenrouterApiKey] = useState(false);
  const [clientId, setClientId] = useState(data.contaAzulClientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [clearClientSecret, setClearClientSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState(data.contaAzulRedirectUri);
  const [msClientId, setMsClientId] = useState(data.microsoftClientId ?? "");
  const [msClientSecret, setMsClientSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload: Record<string, string> = {};
    if (clearOpenrouterApiKey) payload.openrouterApiKey = "";
    else if (openrouterApiKey.trim()) payload.openrouterApiKey = openrouterApiKey.trim();

    if (clientId.trim() !== (data.contaAzulClientId ?? "")) {
      payload.contaAzulClientId = clientId.trim();
    }

    if (clearClientSecret) payload.contaAzulClientSecret = "";
    else if (clientSecret.trim()) payload.contaAzulClientSecret = clientSecret.trim();

    if (redirectUri.trim() !== data.contaAzulRedirectUri) {
      payload.contaAzulRedirectUri = redirectUri.trim();
    }

    if (msClientId.trim() !== (data.microsoftClientId ?? "")) {
      payload.microsoftClientId = msClientId.trim();
    }
    if (msClientSecret.trim()) payload.microsoftClientSecret = msClientSecret.trim();

    if (Object.keys(payload).length === 0) {
      toast.info("Nenhuma alteração para salvar.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/settings/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao salvar.");
      toast.success("Integrações salvas.");
      setOpenrouterApiKey("");
      setClearOpenrouterApiKey(false);
      setClientSecret("");
      setClearClientSecret(false);
      setMsClientSecret("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <Section
        title="OpenRouter"
        description="Chave usada na extração automática dos dados dos boletos."
      >
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-text-primary">Chave da API</span>
            <input
              type="password"
              autoComplete="off"
              className={fieldClass}
              placeholder={data.openrouterApiKey ?? "sk-or-v1-..."}
              value={openrouterApiKey}
              disabled={clearOpenrouterApiKey}
              onChange={(event) => setOpenrouterApiKey(event.target.value)}
            />
            <span className="mt-1 block text-xs text-text-tertiary">
              Deixe em branco para manter o valor atual. A chave fica criptografada no banco.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-card-border px-4 py-3">
            <div>
              <p className="text-xs text-text-tertiary">Situação</p>
              <p className={`text-sm font-medium ${sourceClass(data.status.openrouterApiKey)}`}>
                {sourceLabel(data.status.openrouterApiKey)}
              </p>
            </div>
            {data.status.openrouterApiKey === "database" && (
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={clearOpenrouterApiKey}
                  onChange={(event) => setClearOpenrouterApiKey(event.target.checked)}
                />
                Remover valor salvo
              </label>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="Conta Azul"
        description="Credenciais do aplicativo OAuth usadas para conectar a empresa e lançar contas a pagar."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Client ID</span>
              <input
                className={fieldClass}
                placeholder="Client ID do portal do desenvolvedor"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
              <span className="mt-1 block text-xs text-text-tertiary">
                {sourceLabel(data.status.contaAzulClientId)}
              </span>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Client Secret</span>
              <input
                type="password"
                autoComplete="off"
                className={fieldClass}
                placeholder={data.contaAzulClientSecret ?? "Client Secret"}
                value={clientSecret}
                disabled={clearClientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
              />
              <span className="mt-1 block text-xs text-text-tertiary">
                {sourceLabel(data.status.contaAzulClientSecret)}
              </span>
            </label>
          </div>

          {data.status.contaAzulClientSecret === "database" && (
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={clearClientSecret}
                onChange={(event) => setClearClientSecret(event.target.checked)}
              />
              Remover Client Secret salvo
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-text-primary">
              URL de redirecionamento
            </span>
            <input
              className={fieldClass}
              placeholder="http://localhost:3000/api/conta-azul/callback"
              value={redirectUri}
              onChange={(event) => setRedirectUri(event.target.value)}
            />
            <span className="mt-1 block text-xs text-text-tertiary">
              {sourceLabel(data.status.contaAzulRedirectUri)}. Este endereço precisa estar
              cadastrado no aplicativo do portal do desenvolvedor da Conta Azul.
            </span>
          </label>
        </div>
      </Section>

      <div id="microsoft" className="scroll-mt-24">
        <Section
          title="Login da Microsoft (Outlook, Hotmail, Microsoft 365)"
          description="Necessário só para conectar caixas da Microsoft. Gmail e os demais não precisam disso."
        >
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
              <li>
                Em{" "}
                <a
                  className="underline"
                  href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                  target="_blank"
                  rel="noreferrer"
                >
                  portal.azure.com → Registros de aplicativo
                </a>
                , clique em “Novo registro”. Em tipos de conta, escolha “qualquer diretório e contas
                pessoais”.
              </li>
              <li>
                Em URI de redirecionamento, escolha “Web” e cole:{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs break-all dark:bg-white/10">
                  {data.microsoftRedirectUri}
                </code>
              </li>
              <li>
                Em “Permissões de API”, adicione a permissão delegada{" "}
                <code className="text-xs">IMAP.AccessAsUser.All</code> (Office 365 Exchange Online) e{" "}
                <code className="text-xs">offline_access</code>.
              </li>
              <li>Em “Certificados e segredos”, crie um segredo e cole abaixo junto com o ID do aplicativo.</li>
            </ol>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-text-primary">
                  ID do aplicativo (cliente)
                </span>
                <input
                  className={fieldClass}
                  value={msClientId}
                  onChange={(event) => setMsClientId(event.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-text-primary">Segredo do cliente (valor)</span>
                <input
                  type="password"
                  autoComplete="off"
                  className={fieldClass}
                  value={msClientSecret}
                  onChange={(event) => setMsClientSecret(event.target.value)}
                  placeholder={data.microsoftClientSecret ?? "Valor do segredo"}
                />
                <span className="mt-1 block text-xs text-text-tertiary">
                  {data.microsoftClientSecret ? "Configurado. Deixe em branco para manter." : "Não configurado."}
                </span>
              </label>
            </div>
          </div>
        </Section>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-button-primary-background px-5 py-2.5 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:opacity-60"
        >
          {busy ? "Salvando..." : "Salvar integrações"}
        </button>
      </div>
    </form>
  );
}
