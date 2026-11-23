"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { btnSmall } from "@/components/app/ui";

async function post(path: string) {
  const response = await fetch(path, { method: "POST" });
  const payload = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Não deu certo. Tente de novo.");
}

/** Ações de um boleto que ainda não virou lançamento (sem fornecedor ou não lido). */
export function DocumentActions({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"retry" | "dismiss" | null>(null);

  const run = async (action: "retry" | "dismiss") => {
    setBusy(action);
    try {
      await post(`/api/documents/${documentId}/${action === "retry" ? "reprocess" : "dismiss"}`);
      toast.success(action === "retry" ? "Lendo o boleto de novo…" : "Descartado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu certo. Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2 sm:justify-end">
      <button className={btnSmall} disabled={busy !== null} onClick={() => run("retry")}>
        {busy === "retry" ? "Enviando…" : "Tentar de novo"}
      </button>
      <button className={btnSmall} disabled={busy !== null} onClick={() => run("dismiss")}>
        Descartar
      </button>
    </div>
  );
}
