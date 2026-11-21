"use client";

import { Toggle } from "@/components/tailgrids/core/toggle";
import { toast } from "sonner";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AutoPostToggle({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const change = async (next: boolean) => {
    const previous = checked;
    setChecked(next);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoPostEnabled: next }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao salvar.");
      toast.success(next ? "Lançamento automático ativado." : "Lançamento automático desativado.");
      startTransition(() => router.refresh());
    } catch (error) {
      setChecked(previous);
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-card-border bg-card-background px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">Lançamento automático</p>
        <p className="text-xs text-text-tertiary">
          {checked
            ? "Itens seguros são enviados ao Conta Azul sem revisão."
            : "Todo item passa por revisão antes de ser lançado."}
        </p>
      </div>
      <Toggle
        checked={checked}
        disabled={pending}
        onChange={(event) => change(event.target.checked)}
        aria-label="Alternar lançamento automático"
      />
    </div>
  );
}
