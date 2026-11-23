"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState, fieldClass, Section, StatusBadge } from "@/components/app/ui";
import { formatDateTime } from "@/lib/format";
import type { EmailLinkView, LinkRecipeView } from "@/lib/links/queries";

const METHOD_LABEL: Record<string, string> = {
  direct: "Link direto para o PDF",
  recipe: "Caminho já salvo",
  learned: "Caminho novo salvo",
  relearned: "Caminho atualizado (o site mudou)",
};

const smallButton =
  "rounded-lg border border-button-primary-outline-stroke px-3 py-1.5 text-xs font-medium text-button-primary-outline-text transition hover:bg-button-primary-outline-hover-background disabled:opacity-60";

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha na operação.");
  return payload;
}

export function LinksManager({ recipes, links }: { recipes: LinkRecipeView[]; links: EmailLinkView[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Enquanto houver link sendo processado, atualiza a tela sozinha.
  const working = links.some((link) => link.status === "PENDING" || link.status === "RESOLVING");
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [working, router]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await action();
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na operação.");
    } finally {
      setBusy(null);
    }
  };

  const test = (event: React.FormEvent) => {
    event.preventDefault();
    void run(
      "test",
      () =>
        call("/api/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }).then(() => setUrl("")),
      "Link enviado. Acompanhe o andamento abaixo.",
    );
  };

  return (
    <div className="space-y-5">
      <Section
        title="Testar um link"
        description="Cole o link de um boleto (ex.: Gerencianet/Efí, Asaas, Iugu). O sistema busca o boleto e guarda o caminho para as próximas vezes. Não gera conta a pagar."
      >
        <form onSubmit={test} className="flex flex-col gap-3 sm:flex-row">
          <input
            className={fieldClass}
            placeholder="https://..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            inputMode="url"
          />
          <button
            type="submit"
            disabled={busy !== null || !url.startsWith("https://")}
            className="shrink-0 rounded-lg bg-button-primary-background px-5 py-2.5 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:opacity-60"
          >
            {busy === "test" ? "Enviando..." : "Testar link"}
          </button>
        </form>
      </Section>

      <Section
        title="Caminhos salvos"
        description="Um caminho por site + formato de link. “Direto” = o PDF é baixado na hora, sem precisar navegar pelo site."
      >
        {recipes.length === 0 ? (
          <EmptyState
            title="Nenhum caminho salvo ainda"
            description="Quando chegar um e-mail com link de boleto (ou você testar um acima), o caminho aparece aqui."
          />
        ) : (
          <div className="divide-y divide-card-border">
            {recipes.map((recipe) => (
              <div key={recipe.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-all text-text-primary">
                    {recipe.host}
                    <span className="text-text-tertiary">{recipe.pathPattern}</span>
                  </p>
                  <p className="mt-1 text-xs break-all text-text-secondary">
                    {recipe.fast ? "⚡ Direto: " : "Navegação: "}
                    {recipe.summary}
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    v{recipe.version} · {recipe.successCount} sucesso(s) · {recipe.failureCount} falha(s)
                    {recipe.lastSuccessAt ? ` · último sucesso ${formatDateTime(recipe.lastSuccessAt)}` : ""}
                    {!recipe.active ? " · desativado" : ""}
                  </p>
                  {recipe.lastError && (
                    <p className="mt-1 text-xs break-all text-error-500">Última falha: {recipe.lastError}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    className={smallButton}
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        recipe.id,
                        () =>
                          call(`/api/link-recipes/${recipe.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ active: !recipe.active }),
                          }),
                        recipe.active ? "Caminho desativado." : "Caminho ativado.",
                      )
                    }
                  >
                    {recipe.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    className={smallButton}
                    disabled={busy !== null}
                    onClick={() => {
                      if (!window.confirm("Esquecer este caminho? No próximo link desse site, o sistema buscará o caminho de novo.")) return;
                      void run(
                        recipe.id,
                        () => call(`/api/link-recipes/${recipe.id}`, { method: "DELETE" }),
                        "Caminho esquecido.",
                      );
                    }}
                  >
                    Esquecer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Links recebidos" description="Os últimos links encontrados nos e-mails e nos testes manuais.">
        {links.length === 0 ? (
          <EmptyState title="Nenhum link ainda" />
        ) : (
          <div className="divide-y divide-card-border">
            {links.map((link) => (
              <div key={link.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={link.status} />
                      <span className="text-sm font-medium text-text-primary">{link.host}</span>
                      {link.method && <span className="text-xs text-text-tertiary">{METHOD_LABEL[link.method] ?? link.method}</span>}
                    </div>
                    <p className="mt-1 text-xs break-all text-text-secondary">{link.url}</p>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {link.manual ? "Teste manual" : `${link.subject ?? "(sem assunto)"} — ${link.from ?? ""}`} ·{" "}
                      {formatDateTime(link.createdAt)} · {link.attempts} execução(ões)
                    </p>
                    {link.error && <p className="mt-1 text-xs break-all text-error-500">{link.error}</p>}
                  </div>
                  <div className="flex gap-2">
                    {link.trace.length > 0 && (
                      <button className={smallButton} onClick={() => setOpen(open === link.id ? null : link.id)}>
                        {open === link.id ? "Ocultar passos" : "Ver passos"}
                      </button>
                    )}
                    {!["PENDING", "RESOLVING", "RESOLVED"].includes(link.status) && (
                      <button
                        className={smallButton}
                        disabled={busy !== null}
                        onClick={() =>
                          run(link.id, () => call(`/api/links/${link.id}/retry`, { method: "POST" }), "Link reenviado.")
                        }
                      >
                        Tentar de novo
                      </button>
                    )}
                  </div>
                </div>
                {open === link.id && (
                  <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-gray-50 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-text-secondary dark:bg-white/5">
                    {link.trace.join("\n")}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
