"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fieldClass, Section } from "@/components/app/ui";
import { formatDateTime } from "@/lib/format";

export type EmailAccountView = {
  id: string;
  label: string;
  email: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  folder: string;
  lookbackDays: number;
  active: boolean;
  provider: string | null;
  authType: string;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
};

type Discovery = {
  email: string;
  domain: string;
  via: "domain" | "mx" | "probe" | "unknown";
  provider: {
    id: string;
    name: string;
    host: string;
    port: number;
    secure: boolean;
    auth: "password" | "app-password" | "microsoft";
    passwordLabel: string;
    steps: string[];
    helpUrl?: string;
  };
  alternatives: string[];
  microsoftConfigured: boolean;
};

const PROVIDER_NAMES: Record<string, string> = {
  gmail: "Gmail",
  microsoft: "Microsoft",
  yahoo: "Yahoo",
  icloud: "iCloud",
  zoho: "Zoho",
  uol: "UOL",
  bol: "BOL",
  terra: "Terra",
  hostinger: "Hostinger",
  locaweb: "Locaweb",
  kinghost: "KingHost",
  titan: "Titan",
  godaddy: "GoDaddy",
};

const primaryButton =
  "rounded-lg bg-button-primary-background px-5 py-2.5 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:opacity-60";
const quietButton =
  "rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary disabled:opacity-60";

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

async function api(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({ ok: response.ok }))) as {
    ok: boolean;
    error?: string;
    data?: unknown;
  };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha na operação.");
  return payload.data;
}

export function EmailAccountsManager({
  accounts,
  notice,
}: {
  accounts: EmailAccountView[];
  notice?: { type: "ok" | "erro"; message: string } | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const noticeShown = useRef(false);

  // Resultado do login da Microsoft (volta por parâmetro na URL).
  useEffect(() => {
    if (!notice || noticeShown.current) return;
    noticeShown.current = true;
    if (notice.type === "ok") toast.success(notice.message);
    else toast.error(notice.message, { duration: 12_000 });
    router.replace("/conexoes/emails");
  }, [notice, router]);

  // Detecta o provedor assim que o e-mail estiver completo.
  useEffect(() => {
    const value = email.trim().toLowerCase();
    if (!isEmail(value)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = (await api("/api/email-accounts/discover", "POST", { email: value })) as Discovery;
        if (cancelled) return;
        setDiscovery(found);
        setHost(found.provider.host);
        setPort(String(found.provider.port));
        setUsername(found.email);
        setAdvanced(found.via === "unknown");
        if (found.provider.auth !== "microsoft") setTimeout(() => passwordRef.current?.focus(), 50);
      } catch {
        if (!cancelled) setDiscovery(null);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email]);

  const changeEmail = (value: string) => {
    setEmail(value);
    setDiscovery(null);
    setError(null);
    setUsePassword(false);
  };

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const custom =
        discovery && (host !== discovery.provider.host || port !== String(discovery.provider.port) || username !== discovery.email);
      await api("/api/email-accounts", "POST", {
        email: email.trim(),
        password,
        ...(custom ? { host, port: Number(port), username } : {}),
      });
      toast.success("Caixa conectada. Já estamos buscando os boletos.");
      setEmail("");
      setPassword("");
      setDiscovery(null);
      router.refresh();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Falha ao conectar.";
      setError(message);
      if (/não encontrado|recusou a conexão|Tempo esgotado|SSL/i.test(message)) setAdvanced(true);
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, run: () => Promise<unknown>, success: string) => {
    setBusy(id);
    try {
      await run();
      toast.success(success);
      router.refresh();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Falha na operação.", { duration: 10_000 });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const provider = discovery?.provider;
  const microsoft = provider?.auth === "microsoft" && !usePassword;
  const showPassword = Boolean(provider) && !microsoft;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Section title="Conectar caixa de e-mail" description="Digite o e-mail. O resto a gente descobre.">
        <form onSubmit={connect} className="space-y-4">
          <div>
            <input
              type="email"
              autoComplete="off"
              autoFocus={accounts.length === 0}
              className={`${fieldClass} text-base`}
              placeholder="financeiro@suaempresa.com.br"
              value={email}
              onChange={(event) => changeEmail(event.target.value)}
              aria-label="E-mail da caixa"
            />
            <p className="mt-1.5 min-h-5 text-xs text-text-tertiary" aria-live="polite">
              {searching && "Procurando o servidor deste e-mail…"}
              {!searching && provider && discovery?.via !== "unknown" && (
                <span className="font-medium text-success-500">✓ {provider.name} detectado</span>
              )}
              {!searching && discovery?.via === "unknown" && (
                <span className="text-warning-500">
                  Não achamos o servidor automaticamente. Confira o endereço abaixo com seu provedor.
                </span>
              )}
            </p>
          </div>

          {microsoft && discovery && (
            <div className="space-y-3 rounded-lg border border-card-border p-4">
              {discovery.microsoftConfigured ? (
                <>
                  <p className="text-sm text-text-secondary">
                    A Microsoft não usa senha aqui: você entra na sua conta e autoriza a leitura dos e-mails.
                  </p>
                  <a href={`/api/email-accounts/oauth/microsoft/start?email=${encodeURIComponent(discovery.email)}`} className={`${primaryButton} inline-block`}>
                    Entrar com a Microsoft
                  </a>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-text-primary">Falta ativar o login da Microsoft</p>
                  <p className="text-sm text-text-secondary">
                    Outlook, Hotmail e Microsoft 365 só liberam os e-mails pelo login oficial da Microsoft. Isso é
                    configurado uma única vez, em Configurações.
                  </p>
                  <Link href="/configuracoes#microsoft" className={`${primaryButton} inline-block`}>
                    Abrir Configurações
                  </Link>
                </>
              )}
              <button type="button" className="block text-xs text-text-tertiary underline" onClick={() => setUsePassword(true)}>
                Minha empresa liberou senha de app — conectar com senha
              </button>
            </div>
          )}

          {showPassword && provider && (
            <>
              {provider.steps.length > 0 && !usePassword && (
                <div className="rounded-lg border border-card-border p-4">
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
                    {provider.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {provider.helpUrl && (
                    <a href={provider.helpUrl} target="_blank" rel="noreferrer" className={`${quietButton} mt-3 inline-block`}>
                      Abrir página de senhas de app ↗
                    </a>
                  )}
                </div>
              )}

              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-text-primary">{provider.passwordLabel}</span>
                <input
                  ref={passwordRef}
                  type="password"
                  autoComplete="new-password"
                  className={fieldClass}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              {advanced && (
                <div className="grid gap-3 rounded-lg border border-card-border p-4 sm:grid-cols-3">
                  <label className="block text-xs sm:col-span-2">
                    <span className="mb-1 block font-medium text-text-secondary">Servidor IMAP</span>
                    <input className={fieldClass} value={host} onChange={(event) => setHost(event.target.value)} list="imap-hosts" />
                    <datalist id="imap-hosts">
                      {[provider.host, ...(discovery?.alternatives ?? [])].map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-text-secondary">Porta</span>
                    <input className={fieldClass} value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" />
                  </label>
                  <label className="block text-xs sm:col-span-3">
                    <span className="mb-1 block font-medium text-text-secondary">Usuário (normalmente o próprio e-mail)</span>
                    <input className={fieldClass} value={username} onChange={(event) => setUsername(event.target.value)} />
                  </label>
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-lg border border-error-500/40 bg-error-500/5 px-4 py-3 text-sm text-error-500">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="submit" disabled={busy === "create" || !password} className={primaryButton}>
                  {busy === "create" ? "Conectando…" : "Conectar"}
                </button>
                <button type="button" className="text-xs text-text-tertiary underline" onClick={() => setAdvanced((value) => !value)}>
                  {advanced ? "Ocultar ajustes do servidor" : `Servidor: ${host}:${port} · ajustar`}
                </button>
              </div>
            </>
          )}
        </form>
      </Section>

      <Section title={accounts.length === 0 ? "Nenhuma caixa conectada ainda" : "Caixas conectadas"}>
        {accounts.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Depois de conectar, o sistema busca boletos sozinho a cada 15 minutos (PDFs anexados e links de cobrança).
          </p>
        ) : (
          <ul className="divide-y divide-card-border">
            {accounts.map((account) => {
              const state = !account.active ? "paused" : account.lastError ? "error" : "ok";
              return (
                <li key={account.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        <span
                          aria-hidden
                          className={`size-2 shrink-0 rounded-full ${state === "ok" ? "bg-success-500" : state === "error" ? "bg-error-500" : "bg-gray-400"}`}
                        />
                        <span className="truncate">{account.email}</span>
                      </p>
                      <p className="mt-0.5 pl-4 text-xs text-text-tertiary">
                        {PROVIDER_NAMES[account.provider ?? ""] ?? account.host} ·{" "}
                        {state === "paused"
                          ? "Pausada"
                          : state === "error"
                            ? "Com problema"
                            : account.lastSyncAt
                              ? `Verificada ${formatDateTime(account.lastSyncAt)}`
                              : "Primeira busca em andamento…"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className={quietButton}
                        disabled={busy === account.id}
                        onClick={() => act(account.id, () => api(`/api/email-accounts/${account.id}/sync`, "POST"), "Buscando e-mails novos…")}
                      >
                        Buscar agora
                      </button>
                      <button
                        className={quietButton}
                        disabled={busy === account.id}
                        onClick={() =>
                          act(
                            account.id,
                            () => api(`/api/email-accounts/${account.id}`, "PATCH", { active: !account.active }),
                            account.active ? "Caixa pausada." : "Caixa reativada.",
                          )
                        }
                      >
                        {account.active ? "Pausar" : "Reativar"}
                      </button>
                      <button
                        className={`${quietButton} hover:text-error-500`}
                        disabled={busy === account.id}
                        onClick={() => {
                          if (!window.confirm(`Remover ${account.email} e os e-mails/anexos vinculados?`)) return;
                          void act(account.id, () => api(`/api/email-accounts/${account.id}`, "DELETE"), "Caixa removida.");
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  {state === "error" && (
                    <div className="mt-2 ml-4 rounded-lg border border-error-500/40 bg-error-500/5 px-3 py-2">
                      <p className="text-xs text-error-500">{account.lastError}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          className={quietButton}
                          disabled={busy === account.id}
                          onClick={() => act(account.id, () => api(`/api/email-accounts/${account.id}/test`, "POST"), "Conexão ok.")}
                        >
                          Testar de novo
                        </button>
                        {account.authType === "microsoft" && (
                          <a className={quietButton} href={`/api/email-accounts/oauth/microsoft/start?email=${encodeURIComponent(account.email)}`}>
                            Entrar de novo com a Microsoft
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
