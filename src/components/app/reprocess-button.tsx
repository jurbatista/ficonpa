"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function ReprocessButton({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const run = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/reprocess`, {
        method: "POST",
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao reprocessar.");
      toast.success("Documento enviado para reprocessamento.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao reprocessar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={loading}
      className="rounded-lg border border-button-primary-outline-stroke px-3 py-1.5 text-xs font-medium text-button-primary-outline-text transition hover:bg-button-primary-outline-hover-background disabled:opacity-60"
    >
      {loading ? "Enviando..." : "Reprocessar"}
    </button>
  );
}
