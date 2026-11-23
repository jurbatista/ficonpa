"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { btnPrimary, btnSmall, btnText, fieldClass, Section } from "@/components/app/ui";
import { formatWhen } from "@/lib/format";

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
    hostProblem?: boolean;
    data?: unknown;
  };
  if (!response.ok || !payload.ok) {
    throw Object.assign(new Error(payload.error ?? "Não deu certo. Tente de novo."), {
      hostProblem: Boolean(payload.hostProblem),
    });
  }
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
      toast.success("Caixa conectada. Buscando boletos…");
      setEmail("");
      setPassword("");
      setDiscovery(null);
      router.refresh();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Não foi possível conectar.";
      setError(message);
      if ((failure as { hostProblem?: boolean }).hostProblem) setAdvanced(true);
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
      toast.error(failure instanceof Error ? failure.message : "Não deu certo. Tente de novo.", { duration: 10_000 });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const provider = discovery?.provider;
  const providerName = provider ? (PROVIDER_NAMES[provider.id] ?? provider.name) : "";
  const microsoft = provider?.auth === "microsoft" && !usePassword;
  const showPassword = Boolean(provider) && !microsoft;

  return (
    <div className="max-w-2xl space-y-5">
      {accounts.length > 0 && (
        <Section title="Caixas conectadas">
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
                          className={`size-2 shrink-0 rounded-full ${state === "ok" ? "bg-success-500" : state === "error" ? "bg-error-500" : "bg-text-tertiary"}`}
                        />
                        <span className="truncate">{account.email}</span>
                      </p>
                      <p className="mt-0.5 pl-4 text-xs text-text-tertiary">
                        {state === "paused"
                          ? "Pausada"
                          : state === "error"
                            ? "Não está conectando"
                            : account.lastSyncAt
                              ? `Última busca ${formatWhen(account.lastSyncAt)}`
                              : "Primeira busca em andamento…"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className={btnSmall}
                        disabled={busy === account.id}
                        onClick={() => act(account.id, () => api(`/api/email-accounts/${account.id}/sync`, "POST"), "Buscando…")}
                      >
                        Buscar agora
                      </button>
                      <button
                        className={btnSmall}
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
                        className={btnSmall}
                        disabled={busy === account.id}
                        onClick={() => {
                          if (!window.confirm(`Remover ${account.email}? Os boletos que vieram dela também saem do sistema.`)) return;
                          void act(account.id, () => api(`/api/email-accounts/${account.id}`, "DELETE"), "Caixa removida.");
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  {state === "error" && (
                    <div className="mt-3 ml-4 rounded-lg bg-badge-error-background px-3.5 py-2.5">
                      <p className="text-xs text-badge-error-text">{account.lastError}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          className={btnSmall}
                          disabled={busy === account.id}
                          onClick={() => act(account.id, () => api(`/api/email-accounts/${account.id}/test`, "POST"), "Conectou.")}
                        >
                          Testar de novo
                        </button>
                        {account.authType === "microsoft" && (
                          <a className={btnSmall} href={`/api/email-accounts/oauth/microsoft/start?email=${encodeURIComponent(account.email)}`}>
                            Entrar de novo
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title={accounts.length > 0 ? "Conectar outra caixa" : "Conectar caixa"}>
        <form onSubmit={connect} className="space-y-4">
          <div>
            <input
              type="email"
              autoComplete="off"
              autoFocus={accounts.length === 0}
              className={`${fieldClass} text-base`}
              placeholder="E-mail da caixa"
              value={email}
              onChange={(event) => changeEmail(event.target.value)}
              aria-label="E-mail da caixa"
            />
            <p className="mt-1.5 min-h-5 text-xs" aria-live="polite">
              {searching && <span className="text-text-tertiary">Procurando o servidor…</span>}
              {!searching && provider && discovery?.via !== "unknown" && (
                <span className="font-medium text-badge-success-text">✓ {providerName}</span>
              )}
              {!searching && discovery?.via === "unknown" && (
                <span className="text-badge-warning-text">Não achei o servidor deste e-mail. Informe abaixo.</span>
              )}
            </p>
          </div>

          {microsoft && discovery && (
            <div className="space-y-3">
              {discovery.microsoftConfigured ? (
                <a
                  href={`/api/email-accounts/oauth/microsoft/start?email=${encodeURIComponent(discovery.email)}`}
                  className={btnPrimary}
                >
                  Entrar com a Microsoft
                </a>
              ) : (
                <>
                  <p className="text-sm text-text-secondary">
                    Contas da Microsoft entram pelo login oficial, que ainda não foi ativado aqui.
                  </p>
                  <Link href="/configuracoes#microsoft" className={btnPrimary}>
                    Ativar em Configurações
                  </Link>
                </>
              )}
              <button type="button" className={`${btnText} block text-xs`} onClick={() => setUsePassword(true)}>
                Usar senha de app
              </button>
            </div>
          )}

          {showPassword && provider && (
            <>
              {(provider.auth === "app-password" || provider.steps.length > 0) && !usePassword && (
                <div className="rounded-lg bg-background-gray-secondary_alt px-4 py-3.5 text-sm text-text-secondary">
                  {provider.auth === "app-password" && (
                    <p className="mb-2">O {providerName} pede uma senha de app, não a senha normal.</p>
                  )}
                  {provider.steps.length > 0 && (
                    <ol className="list-decimal space-y-1 pl-5">
                      {provider.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  )}
                  {provider.helpUrl && (
                    <a
                      href={provider.helpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block font-medium text-text-primary underline underline-offset-4"
                    >
                      Criar senha de app ↗
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
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs sm:col-span-2">
                    <span className="mb-1 block font-medium text-text-secondary">Servidor</span>
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
                    <span className="mb-1 block font-medium text-text-secondary">Usuário</span>
                    <input className={fieldClass} value={username} onChange={(event) => setUsername(event.target.value)} />
                  </label>
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-lg bg-badge-error-background px-3.5 py-2.5 text-sm text-badge-error-text">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="submit" disabled={busy === "create" || !password} className={btnPrimary}>
                  {busy === "create" ? "Conectando…" : "Conectar"}
                </button>
                {!advanced && (
                  <button type="button" className={`${btnText} text-xs`} onClick={() => setAdvanced(true)}>
                    Ajustar servidor
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      </Section>
    </div>
  );
}
