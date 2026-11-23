"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { fieldClass, Section } from "@/components/app/ui";
import { Toggle } from "@/components/tailgrids/core/toggle";
import type { PublicSettings } from "@/lib/settings";

const RIGOR_OPTIONS = [
  { value: 0.98, label: "Rigoroso — só lança quando não há nenhuma dúvida" },
  { value: 0.95, label: "Padrão (recomendado)" },
  { value: 0.9, label: "Flexível — lança mais boletos sem revisão" },
];

const RETENTION_OPTIONS = [
  { value: 30, label: "30 dias" },
  { value: 60, label: "60 dias" },
  { value: 90, label: "90 dias (recomendado)" },
  { value: 180, label: "6 meses" },
  { value: 365, label: "1 ano" },
  { value: 730, label: "2 anos" },
  { value: 1825, label: "5 anos" },
];

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`w-20 text-right text-sm font-medium ${checked ? "text-success-500" : "text-text-tertiary"}`}
      >
        {checked ? "Ligado" : "Desligado"}
      </span>
      <Toggle
        size="md"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
    </div>
  );
}

/**
 * Ajustes do dia a dia. Cada mudança é gravada na hora — não existe botão
 * "Salvar" para esquecer.
 */
export function SettingsForm({ initial }: { initial: PublicSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);

  const apply = async (changes: Partial<PublicSettings>, success: string) => {
    const previous = settings;
    setSettings({ ...settings, ...changes });
    setBusy(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Não foi possível salvar.");
      toast.success(success);
      router.refresh();
    } catch (error) {
      setSettings(previous);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar. Tente de novo.",
      );
    } finally {
      setBusy(false);
    }
  };

  const changeRetention = (days: number) => {
    if (
      days < settings.retentionDays &&
      !window.confirm(
        `Boletos e registros com mais de ${days} dias serão apagados em até 1 hora e não podem ser recuperados. Continuar?`,
      )
    ) {
      return;
    }
    void apply({ retentionDays: days }, "Prazo de guarda atualizado.");
  };

  const purge = async () => {
    if (
      !window.confirm(
        `Apagar agora os boletos e registros com mais de ${settings.retentionDays} dias? Isso não pode ser desfeito.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/maintenance/purge", { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Não foi possível iniciar a limpeza.");
      }
      toast.success("Limpeza iniciada. Os dados antigos somem em instantes.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível iniciar a limpeza.",
      );
    } finally {
      setBusy(false);
    }
  };

  const rigorIsPreset = RIGOR_OPTIONS.some(
    (option) => Math.abs(option.value - settings.autoPostThreshold) < 0.0005,
  );
  const retentionIsPreset = RETENTION_OPTIONS.some(
    (option) => option.value === settings.retentionDays,
  );

  return (
    <>
      <Section title="Automação" description="As mudanças são salvas na hora.">
        <div className="divide-y divide-card-border">
          <Row
            title="Lançamento automático"
            description={
              settings.autoPostEnabled
                ? "Boletos conferidos vão direto para o Conta Azul. Os que geram dúvida esperam a sua revisão."
                : "Nenhum boleto é lançado sem a sua aprovação."
            }
          >
            <Switch
              checked={settings.autoPostEnabled}
              disabled={busy}
              label="Lançamento automático"
              onChange={(next) =>
                apply(
                  { autoPostEnabled: next },
                  next ? "Lançamento automático ligado." : "Lançamento automático desligado.",
                )
              }
            />
          </Row>

          {settings.autoPostEnabled && (
            <Row
              title="Rigor da conferência"
              description="Quanto mais rigoroso, mais boletos passam pela sua revisão antes de serem lançados."
            >
              <select
                className={`${fieldClass} sm:w-80`}
                value={String(settings.autoPostThreshold)}
                disabled={busy}
                aria-label="Rigor da conferência"
                onChange={(event) =>
                  apply(
                    { autoPostThreshold: Number(event.target.value) },
                    "Rigor da conferência atualizado.",
                  )
                }
              >
                {!rigorIsPreset && (
                  <option value={String(settings.autoPostThreshold)}>
                    Personalizado ({percent(settings.autoPostThreshold)})
                  </option>
                )}
                {RIGOR_OPTIONS.map((option) => (
                  <option key={option.value} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Row>
          )}

          <Row
            title="Boletos por link"
            description={
              settings.linkResolverEnabled
                ? "Quando o e-mail traz um link em vez do PDF, o sistema abre o link e baixa o boleto."
                : "E-mails que trazem só um link, sem o PDF anexado, são ignorados."
            }
          >
            <Switch
              checked={settings.linkResolverEnabled}
              disabled={busy}
              label="Boletos por link"
              onChange={(next) =>
                apply(
                  { linkResolverEnabled: next },
                  next ? "Boletos por link ligado." : "Boletos por link desligado.",
                )
              }
            />
          </Row>
        </div>
      </Section>

      <Section
        title="Guarda de dados"
        description="Por quanto tempo boletos e registros ficam no sistema."
      >
        <div className="divide-y divide-card-border">
          <Row
            title="Apagar dados após"
            description="Conta a partir da chegada do boleto ou do lançamento, o que acontecer por último. O que já foi lançado continua no Conta Azul."
          >
            <select
              className={`${fieldClass} sm:w-56`}
              value={String(settings.retentionDays)}
              disabled={busy}
              aria-label="Apagar dados após"
              onChange={(event) => changeRetention(Number(event.target.value))}
            >
              {!retentionIsPreset && (
                <option value={String(settings.retentionDays)}>
                  {settings.retentionDays} dias
                </option>
              )}
              {RETENTION_OPTIONS.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </Row>

          <Row
            title="Limpar agora"
            description="A limpeza já acontece sozinha, de hora em hora. Use só se precisar liberar espaço imediatamente."
          >
            <button
              type="button"
              onClick={purge}
              disabled={busy}
              className="rounded-lg border border-button-error-outline-stroke px-4 py-2.5 text-sm font-medium text-button-error-outline-text transition hover:bg-button-error-outline-hover-background disabled:opacity-60"
            >
              Apagar dados antigos
            </button>
          </Row>
        </div>
      </Section>
    </>
  );
}
