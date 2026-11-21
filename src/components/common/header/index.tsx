"use client";

import { MenuIcon } from "@/components/common/header/icons";
import ThemeToggle from "@/components/common/header/theme-toggle";
import { BrandWithText } from "@/components/common/brand";
import { ThreeDots } from "@/components/common/sidebar/icon";
import { buttonStyles } from "@/components/tailgrids/core/button";
import { cn } from "@/utils/cn";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import React from "react";

const TITLES: { match: (path: string) => boolean; title: string; subtitle: string }[] = [
  { match: (p) => p === "/", title: "Painel", subtitle: "Visão geral da operação" },
  {
    match: (p) => p.startsWith("/contas-a-pagar"),
    title: "Contas a pagar",
    subtitle: "Boletos importados e lançamentos",
  },
  {
    match: (p) => p.startsWith("/conexoes/emails"),
    title: "E-mails",
    subtitle: "Caixas monitoradas via IMAP",
  },
  {
    match: (p) => p.startsWith("/conexoes/conta-azul"),
    title: "Conta Azul",
    subtitle: "Conexão e cadastros sincronizados",
  },
  {
    match: (p) => p.startsWith("/configuracoes"),
    title: "Configurações",
    subtitle: "Automação, limiares e retenção",
  },
];

export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  const current =
    TITLES.find((item) => item.match(pathname)) ?? {
      title: "ficonpa",
      subtitle: "Contas a pagar automáticas",
    };

  const logout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b-[0.5px] border-card-border bg-card-surface-area px-2 py-4 lg:px-5">
        {/* Mobile (< xl) */}
        <div className="flex items-center xl:hidden">
          <div className="flex flex-1 justify-start">
            <button
              id="mobile-menu-toggle"
              onClick={onMenuClick}
              aria-label="Abrir menu"
              className="rounded-md px-1.5 py-1 text-icon-tertiary transition-colors hover:text-text-primary"
            >
              <MenuIcon />
            </button>
          </div>

          <Link href="/" className="flex items-center justify-center">
            <BrandWithText />
          </Link>

          <div className="flex flex-1 justify-end">
            <button
              id="mobile-info-toggle"
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              aria-label="Abrir atalhos"
              className={cn(
                "rounded-md px-1.5 py-3 transition-colors",
                isDrawerOpen
                  ? "bg-background-gray-secondary text-text-primary"
                  : "text-icon-tertiary hover:text-text-primary",
              )}
            >
              <ThreeDots />
            </button>
          </div>
        </div>

        {/* Desktop (xl+) */}
        <div className="hidden items-center justify-between xl:flex">
          <div className="flex flex-col">
            <h1 className="text-base font-semibold leading-6 text-text-primary">
              {current.title}
            </h1>
            <p className="text-xs text-text-tertiary">{current.subtitle}</p>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <button
              onClick={logout}
              disabled={loggingOut}
              className={buttonStyles({
                variant: "primary",
                appearance: "outline",
                size: "sm",
              })}
            >
              {loggingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        </div>
      </header>

      <div className={cn("xl:hidden", isDrawerOpen ? "block" : "hidden")}>
        <div className="px-5 py-4 shadow-xs">
          <div className="flex items-center justify-between gap-2.5">
            <ThemeToggle />
            <button
              onClick={logout}
              disabled={loggingOut}
              className={buttonStyles({
                variant: "primary",
                appearance: "outline",
                size: "sm",
              })}
            >
              {loggingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
