"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, fieldClass, Section, StatusBadge } from "@/components/app/ui";
import { Toggle } from "@/components/tailgrids/core/toggle";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from "@/components/tailgrids/core/table";
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
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
};

const PRESETS = [
  { label: "Gmail", host: "imap.gmail.com", port: 993 },
  { label: "Outlook / Microsoft 365", host: "outlook.office365.com", port: 993 },
  { label: "Yahoo", host: "imap.mail.yahoo.com", port: 993 },
  { label: "UOL", host: "imap.uol.com.br", port: 993 },
  { label: "Terra", host: "imap.terra.com.br", port: 993 },
  { label: "Zoho", host: "imap.zoho.com", port: 993 },
];

const EMPTY = {
  label: "",
  email: "",
  host: "imap.gmail.com",
  port: "993",
  username: "",
  password: "",
  folder: "INBOX",
  lookbackDays: "30",
};

export function EmailAccountsManager({ accounts }: { accounts: EmailAccountView[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(accounts.length === 0);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("create");
    try {
      const response = await fetch("/api/email-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          port: Number(form.port),
          lookbackDays: Number(form.lookbackDays),
          secure: true,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao conectar.");
      toast.success("Caixa conectada.");
      setForm(EMPTY);
      setShowForm(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao conectar.");
    } finally {
      setBusy(null);
    }
  };

  const action = async (id: string, path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    setBusy(id);
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json().catch(() => ({ ok: response.ok }))) as {
        ok: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha na operação.");
      toast.success("Operação concluída.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na operação.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remover esta caixa e todos os e-mails/anexos vinculados?")) return;
    await action(id, `/api/email-accounts/${id}`, "DELETE");
  };

  return (
    <div className="space-y-5">
      <Section
        title="Caixas monitoradas"
        description="Somente anexos PDF são lidos. O conteúdo dos e-mails não é armazenado."
        actions={
          <button
            onClick={() => setShowForm((value) => !value)}
            className="rounded-lg bg-button-primary-background px-4 py-2 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background"
          >
            {showForm ? "Fechar formulário" : "Adicionar caixa"}
          </button>
        }
      >
        {accounts.length === 0 ? (
          <EmptyState
            title="Nenhuma caixa conectada"
            description="Use uma senha de aplicativo do seu provedor (não a senha normal da conta)."
          />
        ) : (
          <TableRoot fullBleed className="border-0">
            <TableHeader>
              <TableRow>
                <TableHead>Caixa</TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead>Última sincronização</TableHead>
                <TableHead>Ativa</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <p className="text-sm font-medium text-text-primary">{account.label}</p>
                    <p className="text-xs text-text-tertiary">{account.email}</p>
                    {account.lastError && (
                      <p className="max-w-[280px] truncate text-xs text-error-500">
                        {account.lastError}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {account.host}:{account.port} · {account.folder}
                    <br />
                    últimos {account.lookbackDays} dias
                  </TableCell>
                  <TableCell className="text-xs text-text-tertiary">
                    {account.lastSyncAt ? formatDateTime(account.lastSyncAt) : "Nunca"}
                  </TableCell>
                  <TableCell>
                    <Toggle
                      checked={account.active}
                      disabled={busy === account.id}
                      onChange={(event) =>
                        action(account.id, `/api/email-accounts/${account.id}`, "PATCH", {
                          active: event.target.checked,
                        })
                      }
                      aria-label={`Ativar ${account.email}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() =>
                          action(account.id, `/api/email-accounts/${account.id}/test`, "POST")
                        }
                        disabled={busy === account.id}
                        className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary disabled:opacity-60"
                      >
                        Testar
                      </button>
                      <button
                        onClick={() =>
                          action(account.id, `/api/email-accounts/${account.id}/sync`, "POST")
                        }
                        disabled={busy === account.id}
                        className="rounded-lg border border-button-primary-outline-stroke px-3 py-1.5 text-xs font-medium text-button-primary-outline-text transition hover:bg-button-primary-outline-hover-background disabled:opacity-60"
                      >
                        Sincronizar
                      </button>
                      <button
                        onClick={() => remove(account.id)}
                        disabled={busy === account.id}
                        className="rounded-lg border border-button-error-outline-stroke px-3 py-1.5 text-xs font-medium text-button-error-outline-text transition hover:bg-button-error-outline-hover-background disabled:opacity-60"
                      >
                        Excluir
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableRoot>
        )}
      </Section>

      {showForm && (
        <Section
          title="Nova caixa de e-mail"
          description="A conexão é validada antes de salvar. A senha fica criptografada no banco."
        >
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Nome da caixa</span>
              <input
                className={fieldClass}
                value={form.label}
                onChange={set("label")}
                placeholder="Financeiro"
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">E-mail</span>
              <input
                type="email"
                className={fieldClass}
                value={form.email}
                onChange={set("email")}
                placeholder="financeiro@empresa.com.br"
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Servidor IMAP</span>
              <input
                className={fieldClass}
                value={form.host}
                onChange={set("host")}
                list="imap-presets"
                required
              />
              <datalist id="imap-presets">
                {PRESETS.map((preset) => (
                  <option key={preset.host} value={preset.host}>
                    {preset.label}
                  </option>
                ))}
              </datalist>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Porta</span>
              <input
                className={fieldClass}
                value={form.port}
                onChange={set("port")}
                inputMode="numeric"
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Usuário</span>
              <input
                className={fieldClass}
                value={form.username}
                onChange={set("username")}
                placeholder="financeiro@empresa.com.br"
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">
                Senha de aplicativo
              </span>
              <input
                type="password"
                className={fieldClass}
                value={form.password}
                onChange={set("password")}
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Pasta</span>
              <input className={fieldClass} value={form.folder} onChange={set("folder")} />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">
                Dias de histórico na primeira varredura
              </span>
              <input
                className={fieldClass}
                value={form.lookbackDays}
                onChange={set("lookbackDays")}
                inputMode="numeric"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy === "create"}
                className="rounded-lg bg-button-primary-background px-4 py-2.5 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:opacity-60"
              >
                {busy === "create" ? "Validando conexão..." : "Conectar caixa"}
              </button>
            </div>
          </form>
        </Section>
      )}

      <div className="rounded-xl border border-card-border bg-card-background p-5 text-sm text-text-secondary">
        <p className="font-medium text-text-primary">Como funciona</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
          <li>O sistema varre apenas anexos PDF; o corpo do e-mail é descartado.</li>
          <li>Não há filtro por remetente, domínio ou assunto: todo PDF passa pela triagem.</li>
          <li>PDFs que não são boleto são descartados e não aparecem na tela principal.</li>
          <li>O histórico inicial padrão é de 30 dias; depois a varredura é incremental.</li>
        </ul>
      </div>
    </div>
  );
}
