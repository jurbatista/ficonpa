"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { btnPrimary, fieldClass, Section } from "@/components/app/ui";
import { CUSTOM_RULES_MAX_LENGTH } from "@/lib/limits";

const EXAMPLE = [
  "Ignorar boletos da Empresa X.",
  "Boletos acima de R$ 5.000,00 sempre passam por conferência.",
  "Boletos da Escola Y com juros podem ser lançados de novo.",
].join("\n");

/** Regras escritas à mão, uma por linha, aplicadas a cada boleto que chega. */
export function RulesForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customRules: text }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        data?: { customRules: string };
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Não foi possível salvar.");
      const stored = payload.data?.customRules ?? text.trim();
      setSaved(stored);
      setText(stored);
      toast.success("Regras salvas.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar. Tente de novo.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Regras">
      <form onSubmit={save}>
        <textarea
          className={`${fieldClass} min-h-40 resize-y leading-6`}
          rows={6}
          maxLength={CUSTOM_RULES_MAX_LENGTH}
          placeholder={EXAMPLE}
          aria-label="Regras"
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="mt-4 flex justify-end">
          <button type="submit" className={btnPrimary} disabled={busy || text.trim() === saved.trim()}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Section>
  );
}
