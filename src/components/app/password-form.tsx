"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { fieldClass, Section } from "@/components/app/ui";

export function PasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (newPassword.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação não confere com a nova senha.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao alterar a senha.");
      toast.success("Senha alterada.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar a senha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Section
        title="Senha de acesso"
        description="Senha única usada para entrar no ficonpa. Fica armazenada como hash scrypt."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Senha atual</span>
              <input
                type="password"
                autoComplete="current-password"
                className={fieldClass}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Nova senha</span>
              <input
                type="password"
                autoComplete="new-password"
                className={fieldClass}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <span className="mt-1 block text-xs text-text-tertiary">Mínimo de 8 caracteres.</span>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-primary">Confirmar nova senha</span>
              <input
                type="password"
                autoComplete="new-password"
                className={fieldClass}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-button-primary-background px-5 py-2.5 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:opacity-60"
            >
              {busy ? "Alterando..." : "Alterar senha"}
            </button>
          </div>
        </div>
      </Section>
    </form>
  );
}
