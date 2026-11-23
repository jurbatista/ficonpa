"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Mantém a tela em dia enquanto ela está aberta e visível. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
