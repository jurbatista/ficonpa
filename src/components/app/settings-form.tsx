"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { fieldClass, Section } from "@/components/app/ui";
import { Toggle } from "@/components/tailgrids/core/toggle";
import type { AppSettings } from "@/lib/settings";

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState<"save" | "purge" | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("save");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao salvar.");
      toast.success("Configurações salvas.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(null);
    }
  };

  const purge = async () => {
    if (!window.confirm("Executar a limpeza de retenção agora? Esta ação apaga dados antigos.")) {
      return;
    }
    setBusy("purge");
    try {
      const response = await fetch("/api/maintenance/purge", { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao enfileirar.");
      toast.success("Limpeza enfileirada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enfileirar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <Section
        title="Lançamento automático"
        description="Quando ativado, itens que passam em todas as travas são enviados sem revisão."
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-card-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Ativar lançamento automático</p>
              <p className="text-xs text-text-secondary">
                O item continua visível na lista, com origem “Automático”.
              </p>
            </div>
            <Toggle
              checked={form.autoPostEnabled}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, autoPostEnabled: event.target.checked }))
              }
              aria-label="Ativar lançamento automático"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">
                Limiar para lançamento automático
              </span>
              <input
                type="number"
                min={0.5}
                max={1}
                step={0.01}
                className={fieldClass}
                value={form.autoPostThreshold}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    autoPostThreshold: Number(event.target.value),
                  }))
                }
              />
              <span className="mt-1 block text-xs text-text-tertiary">
                Padrão 0,95. Exige também match por CNPJ, qualidade ≥ 2 e classificação resolvida.
              </span>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">
                Limiar mínimo para considerar boleto
              </span>
              <input
                type="number"
                min={0.5}
                max={1}
                step={0.01}
                className={fieldClass}
                value={form.reviewThreshold}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    reviewThreshold: Number(event.target.value),
                  }))
                }
              />
              <span className="mt-1 block text-xs text-text-tertiary">
                Padrão 0,80. Abaixo disso o PDF é descartado como “não é boleto”.
              </span>
            </label>
          </div>
        </div>
      </Section>

      <Section title="Modelos de IA" description="Qwen para extração; Jev para decisão e confiança.">
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-card-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Usar Jev nas decisões</p>
              <p className="text-xs text-text-secondary">
                Se desativado, o sistema usa apenas as regras determinísticas (fail closed).
              </p>
            </div>
            <Toggle
              checked={form.jevEnabled}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, jevEnabled: event.target.checked }))
              }
              aria-label="Usar Jev"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Modelo Jev</span>
              <input
                className={fieldClass}
                value={form.jevModel}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, jevModel: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Modelo Qwen</span>
              <input
                className={fieldClass}
                value={form.qwenModel}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, qwenModel: event.target.value }))
                }
              />
            </label>
          </div>
        </div>
      </Section>

      <Section
        title="Retenção de dados"
        description="Conta a partir da entrada no sistema ou do lançamento, o que ocorrer por último."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-text-primary">Dias de retenção</span>
            <input
              type="number"
              min={1}
              max={3650}
              className={fieldClass}
              value={form.retentionDays}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  retentionDays: Number(event.target.value),
                }))
              }
            />
            <span className="mt-1 block text-xs text-text-tertiary">
              Padrão 90 dias. Apaga registros do banco e arquivos do disco.
            </span>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={purge}
              disabled={busy !== null}
              className="rounded-lg border border-button-error-outline-stroke px-4 py-2.5 text-sm font-medium text-button-error-outline-text transition hover:bg-button-error-outline-hover-background disabled:opacity-60"
            >
              {busy === "purge" ? "Enfileirando..." : "Executar limpeza agora"}
            </button>
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy !== null}
          className="rounded-lg bg-button-primary-background px-5 py-2.5 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:opacity-60"
        >
          {busy === "save" ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </form>
  );
}
