"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { btnPrimary, btnSmall, btnText, fieldClass, Section, StatusBadge } from "@/components/app/ui";
import { formatWhen, senderName } from "@/lib/format";
import type { EmailLinkView, LinkRecipeView } from "@/lib/links/queries";

async function call(url: string, method: "POST" | "DELETE", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Não deu certo. Tente de novo.");
}

const isWorking = (link: EmailLinkView) => link.status === "PENDING" || link.status === "RESOLVING";

/** Na etiqueta, "falhou" de link não é o mesmo que "não lançou" de boleto. */
function badge(status: string): string {
  if (status === "FAILED") return "LINK_FAILED";
  if (status === "PENDING") return "RESOLVING";
  return status;
}

function Details({ link }: { link: EmailLinkView }) {
  const [open, setOpen] = useState(false);
  if (link.details.length === 0) return null;
  return (
    <>
      <button className={`${btnText} mt-1.5 text-xs`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Ocultar detalhes" : "Detalhes"}
      </button>
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-background-gray-secondary_alt p-3 text-[11px] leading-relaxed break-all whitespace-pre-wrap text-text-secondary">
          {[link.url, ...link.details].join("\n")}
        </pre>
      )}
    </>
  );
}

export function LinksManager({ recipes, links }: { recipes: LinkRecipeView[]; links: EmailLinkView[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Enquanto algum link está sendo aberto, a tela acompanha sozinha.
  const working = links.some(isWorking);
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
      toast.error(error instanceof Error ? error.message : "Não deu certo. Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  const test = (event: React.FormEvent) => {
    event.preventDefault();
    void run("test", () => call("/api/links", "POST", { url: url.trim() }).then(() => setUrl("")), "Abrindo o link…");
  };

  // Links de e-mail que deram certo viraram boletos e não precisam aparecer aqui.
  const pending = links.filter((link) => !link.manual && link.status !== "RESOLVED");
  const tests = links.filter((link) => link.manual);

  return (
    <div className="max-w-3xl space-y-5">
      {pending.length > 0 && (
        <Section title="Não baixados">
          {pending.some((link) => link.stuck) && (
            <p className="mb-4 text-sm text-text-secondary">
              Abra o link, salve o PDF e envie em anexo para a caixa conectada.
            </p>
          )}
          <ul className="divide-y divide-card-border">
            {pending.map((link) => (
              <li key={link.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 sm:flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {senderName(link.from) ?? link.host}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-text-tertiary">
                      {[link.subject, formatWhen(link.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                    {link.reason && (
                      <p className={`mt-1 text-xs ${isWorking(link) ? "text-text-secondary" : "text-badge-warning-text"}`}>
                        {link.reason}
                      </p>
                    )}
                  </div>
                  {!isWorking(link) && (
                    <div className="flex flex-wrap items-center gap-2">
                      <a className={btnSmall} href={link.url} target="_blank" rel="noreferrer">
                        Abrir link ↗
                      </a>
                      <button
                        className={btnSmall}
                        disabled={busy !== null}
                        onClick={() => run(link.id, () => call(`/api/links/${link.id}/retry`, "POST"), "Abrindo o link de novo…")}
                      >
                        Tentar de novo
                      </button>
                      <button
                        className={btnSmall}
                        disabled={busy !== null}
                        onClick={() => run(link.id, () => call(`/api/links/${link.id}`, "DELETE"), "Ignorado.")}
                      >
                        Ignorar
                      </button>
                    </div>
                  )}
                </div>
                <Details link={link} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Testar um link">
        <form onSubmit={test} className="flex flex-col gap-3 sm:flex-row">
          <input
            className={fieldClass}
            placeholder="Cole o link de um boleto"
            aria-label="Link do boleto"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            inputMode="url"
          />
          <button type="submit" disabled={busy !== null || !url.trim().startsWith("https://")} className={`${btnPrimary} shrink-0`}>
            {busy === "test" ? "Enviando…" : "Testar"}
          </button>
        </form>

        {tests.length > 0 && (
          <ul className="mt-5 divide-y divide-card-border border-t border-card-border">
            {tests.map((link) => (
              <li key={link.id} className="py-3.5 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 text-sm text-text-primary">
                    <StatusBadge status={badge(link.status)} />
                    <span className="truncate font-medium">{link.host}</span>
                    <span className="shrink-0 text-xs text-text-tertiary">{formatWhen(link.createdAt)}</span>
                  </p>
                  {!isWorking(link) && (
                    <button
                      className={btnSmall}
                      disabled={busy !== null}
                      onClick={() => run(link.id, () => call(`/api/links/${link.id}`, "DELETE"), "Removido.")}
                    >
                      Remover
                    </button>
                  )}
                </div>
                {link.reason && !isWorking(link) && <p className="mt-1 text-xs text-text-secondary">{link.reason}</p>}
                <Details link={link} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {recipes.length > 0 && (
        <Section title="Sites conhecidos">
          <ul className="divide-y divide-card-border">
            {recipes.map((recipe) => (
              <li key={recipe.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {recipe.host}
                    <span className="font-normal text-text-tertiary">{recipe.pathPattern}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {recipe.successCount === 1 ? "1 boleto baixado" : `${recipe.successCount} boletos baixados`}
                    {recipe.lastSuccessAt ? ` · ${formatWhen(recipe.lastSuccessAt)}` : ""}
                  </p>
                </div>
                <button
                  className={btnSmall}
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(`Esquecer ${recipe.host}? O caminho será descoberto de novo no próximo boleto.`)) return;
                    void run(recipe.id, () => call(`/api/link-recipes/${recipe.id}`, "DELETE"), "Esquecido.");
                  }}
                >
                  Esquecer
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
