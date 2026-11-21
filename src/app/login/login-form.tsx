"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fieldClass } from "@/components/app/ui";

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
      setError("Falha de conexão. Tente novamente.");
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
        Senha de acesso
      </label>
      <input
        id="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        placeholder="Digite a senha do painel"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className={fieldClass}
      />

      {error && <p className="mt-2 text-sm text-input-error">{error}</p>}

      <button
        type="submit"
        disabled={loading || password.length === 0}
        className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-button-primary-background text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
