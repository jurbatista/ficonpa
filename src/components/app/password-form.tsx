"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { btnOutline, fieldClass, Section } from "@/components/app/ui";

export function PasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (newPassword.length < 8) {
      toast.error("A nova senha precisa de 8 caracteres ou mais.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As duas senhas novas estão diferentes.");
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
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Não foi possível trocar a senha.");
      toast.success("Senha trocada.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível trocar a senha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Section title="Senha">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-text-primary">Atual</span>
            <input
              type="password"
              autoComplete="current-password"
              className={fieldClass}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-text-primary">Nova</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="8 caracteres ou mais"
              className={fieldClass}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-text-primary">Repetir a nova</span>
            <input
              type="password"
              autoComplete="new-password"
              className={fieldClass}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy || !currentPassword || !newPassword || !confirmPassword}
          className={`${btnOutline} mt-4`}
        >
          {busy ? "Trocando…" : "Trocar senha"}
        </button>
      </Section>
    </form>
  );
}
