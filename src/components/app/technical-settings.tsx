"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fieldClass } from "@/components/app/ui";

type Source = "database" | "environment" | null;

export type TechnicalSettingsData = {
  contaAzulClientId: string | null;
  contaAzulClientSecret: string | null;
  contaAzulRedirectUri: string;
  microsoftClientId: string | null;
  microsoftClientSecret: string | null;
  microsoftRedirectUri: string;
  reviewThreshold: number;
  linkLearningAttempts: number;
  status: {
    contaAzulClientId: Source;
    contaAzulClientSecret: Source;
    contaAzulRedirectUri: Source;
    microsoftClientId: Source;
    microsoftClientSecret: Source;
  };
};

function SourceTag({ source }: { source: Source }) {
  if (source === "database") {
    return <span className="text-xs font-medium text-success-500">Configurado</span>;
  }
  if (source === "environment") {
    return <span className="text-xs font-medium text-success-500">Configurado na instalação</span>;
  }
  return <span className="text-xs font-medium text-warning-500">Não configurado</span>;
}

function Label({ text, source }: { text: string; source?: Source }) {
  return (
    <span className="mb-1.5 flex items-center justify-between gap-2">
      <span className="font-medium text-text-primary">{text}</span>
      {source !== undefined && <SourceTag source={source} />}
    </span>
  );
}

function SecretField({
  label,
  masked,
  source,
  value,
  remove,
  onChange,
  onRemove,
}: {
  label: string;
  masked: string | null;
  source: Source;
  value: string;
  remove: boolean;
  onChange: (value: string) => void;
  onRemove: (remove: boolean) => void;
}) {
  return (
    <div className="text-sm">
      <label className="block">
        <Label text={label} source={source} />
        <input
          type="password"
          autoComplete="off"
          className={fieldClass}
          placeholder={masked ?? "Cole aqui"}
          value={value}
          disabled={remove}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {source !== null && !remove && (
        <span className="mt-1.5 block text-xs text-text-tertiary">
          Deixe em branco para manter a atual.
        </span>
      )}
      {source === "database" && (
        <label className="mt-1.5 flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={remove}
            onChange={(event) => onRemove(event.target.checked)}
          />
          Remover a chave salva
        </label>
      )}
    </div>
  );
}

async function patch(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Não foi possível salvar.");
}

/**
 * Ajustes feitos uma vez, na instalação. Ficam recolhidos para não competir
 * com o que a pessoa usa no dia a dia.
 */
export function TechnicalSettings({ data }: { data: TechnicalSettingsData }) {
  const router = useRouter();
  const details = useRef<HTMLDetailsElement>(null);

  const [clientId, setClientId] = useState(data.contaAzulClientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [removeClientSecret, setRemoveClientSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState(data.contaAzulRedirectUri);
  const [msClientId, setMsClientId] = useState(data.microsoftClientId ?? "");
  const [msClientSecret, setMsClientSecret] = useState("");
  const [removeMsClientSecret, setRemoveMsClientSecret] = useState(false);
  const [reviewPercent, setReviewPercent] = useState(
    String(Math.round(data.reviewThreshold * 100)),
  );
  const [attempts, setAttempts] = useState(String(data.linkLearningAttempts));
  const [busy, setBusy] = useState(false);

  // A tela de e-mails aponta para /configuracoes#microsoft: abre a seção e rola até lá.
  useEffect(() => {
    if (window.location.hash !== "#microsoft" || !details.current) return;
    details.current.open = true;
    document.getElementById("microsoft")?.scrollIntoView({ block: "start" });
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();

    const review = Number(reviewPercent);
    if (!reviewPercent.trim() || !Number.isFinite(review) || review < 50 || review > 100) {
      toast.error("A certeza mínima para aceitar um boleto deve ficar entre 50 e 100.");
      return;
    }
    const tries = Number(attempts);
    if (!attempts.trim() || !Number.isInteger(tries) || tries < 1 || tries > 6) {
      toast.error("As tentativas de busca por link devem ficar entre 1 e 6.");
      return;
    }

    const integrations: Record<string, string> = {};
    if (clientId.trim() !== (data.contaAzulClientId ?? "")) {
      integrations.contaAzulClientId = clientId.trim();
    }
    if (removeClientSecret) integrations.contaAzulClientSecret = "";
    else if (clientSecret.trim()) integrations.contaAzulClientSecret = clientSecret.trim();
    if (redirectUri.trim() !== data.contaAzulRedirectUri) {
      integrations.contaAzulRedirectUri = redirectUri.trim();
    }
    if (msClientId.trim() !== (data.microsoftClientId ?? "")) {
      integrations.microsoftClientId = msClientId.trim();
    }
    if (removeMsClientSecret) integrations.microsoftClientSecret = "";
    else if (msClientSecret.trim()) integrations.microsoftClientSecret = msClientSecret.trim();

    const general: Record<string, number> = {};
    if (review !== Math.round(data.reviewThreshold * 100)) general.reviewThreshold = review / 100;
    if (tries !== data.linkLearningAttempts) general.linkLearningAttempts = tries;

    const hasIntegrations = Object.keys(integrations).length > 0;
    const hasGeneral = Object.keys(general).length > 0;
    if (!hasIntegrations && !hasGeneral) {
      toast.info("Nada foi alterado.");
      return;
    }

    setBusy(true);
    try {
      if (hasGeneral) await patch("/api/settings", general);
      if (hasIntegrations) await patch("/api/settings/integrations", integrations);
      toast.success("Configuração técnica salva.");
      setClientSecret("");
      setRemoveClientSecret(false);
      setMsClientSecret("");
      setRemoveMsClientSecret(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar. Tente de novo.",
      );
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  const groupTitle = "text-sm font-semibold text-text-primary";
  const groupHint = "mt-0.5 text-sm text-text-secondary";

  return (
    <details
      ref={details}
      className="group rounded-xl border-[0.5px] border-card-border bg-card-background"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Configuração técnica</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            Feita uma vez, na instalação. Só altere com orientação do suporte.
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium text-text-secondary group-open:hidden">
          Mostrar
        </span>
        <span className="hidden shrink-0 text-sm font-medium text-text-secondary group-open:inline">
          Ocultar
        </span>
      </summary>

      <form onSubmit={save} className="space-y-8 border-t border-card-border p-5">
        <div>
          <h4 className={groupTitle}>Conta Azul</h4>
          <p className={groupHint}>
            Dados do aplicativo criado no portal do desenvolvedor da Conta Azul.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <Label text="ID do aplicativo (client ID)" source={data.status.contaAzulClientId} />
              <input
                className={fieldClass}
                placeholder="Cole aqui"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
            </label>
            <SecretField
              label="Chave secreta (client secret)"
              masked={data.contaAzulClientSecret}
              source={data.status.contaAzulClientSecret}
              value={clientSecret}
              remove={removeClientSecret}
              onChange={setClientSecret}
              onRemove={setRemoveClientSecret}
            />
          </div>
          <label className="mt-4 block text-sm">
            <Label text="Endereço de retorno" />
            <input
              className={fieldClass}
              value={redirectUri}
              onChange={(event) => setRedirectUri(event.target.value)}
            />
            <span className="mt-1.5 block text-xs text-text-tertiary">
              Precisa ser exatamente o mesmo endereço cadastrado no aplicativo da Conta Azul.
            </span>
          </label>
        </div>

        <div id="microsoft" className="scroll-mt-24">
          <h4 className={groupTitle}>E-mails da Microsoft (Outlook, Hotmail, Microsoft 365)</h4>
          <p className={groupHint}>
            Necessário só para conectar caixas da Microsoft. Gmail e os demais não precisam disso.
          </p>
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-text-secondary">
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
            <li>
              Em “Certificados e segredos”, crie um segredo e cole abaixo junto com o ID do
              aplicativo.
            </li>
          </ol>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <Label text="ID do aplicativo (cliente)" source={data.status.microsoftClientId} />
              <input
                className={fieldClass}
                placeholder="00000000-0000-0000-0000-000000000000"
                value={msClientId}
                onChange={(event) => setMsClientId(event.target.value)}
              />
            </label>
            <SecretField
              label="Segredo do cliente (valor)"
              masked={data.microsoftClientSecret}
              source={data.status.microsoftClientSecret}
              value={msClientSecret}
              remove={removeMsClientSecret}
              onChange={setMsClientSecret}
              onRemove={setRemoveMsClientSecret}
            />
          </div>
        </div>

        <div>
          <h4 className={groupTitle}>Ajustes finos</h4>
          <p className={groupHint}>Os valores padrão atendem à maioria dos casos.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <Label text="Certeza mínima para aceitar um boleto (%)" />
              <input
                type="number"
                min={50}
                max={100}
                step={1}
                className={fieldClass}
                value={reviewPercent}
                onChange={(event) => setReviewPercent(event.target.value)}
              />
              <span className="mt-1.5 block text-xs text-text-tertiary">
                Padrão 80. Abaixo disso o documento é descartado como “não é boleto”.
              </span>
            </label>
            <label className="block text-sm">
              <Label text="Tentativas de busca por link" />
              <input
                type="number"
                min={1}
                max={6}
                step={1}
                className={fieldClass}
                value={attempts}
                onChange={(event) => setAttempts(event.target.value)}
              />
              <span className="mt-1.5 block text-xs text-text-tertiary">
                Padrão 3. Quantas vezes tentar de novo quando o boleto não é encontrado no link.
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end border-t border-card-border pt-5">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-button-primary-background px-5 py-2.5 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:opacity-60"
          >
            {busy ? "Salvando..." : "Salvar configuração técnica"}
          </button>
        </div>
      </form>
    </details>
  );
}
