"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, fieldClass } from "@/components/app/ui";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Não foi possível entrar.");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border-[0.5px] border-card-border bg-card-background p-6 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]"
    >
      <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-text-primary">
        Senha
      </label>
      <input
        id="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "login-error" : undefined}
        className={fieldClass}
      />

      {error && (
        <p id="login-error" role="alert" className="mt-2 text-sm text-input-error">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading || password.length === 0} className={`${btnPrimary} mt-4 h-11 w-full`}>
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
