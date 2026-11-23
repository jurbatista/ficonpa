"use client";

import { BrandMark, BrandWithText } from "@/components/common/brand";
import ThemeToggle from "@/components/common/header/theme-toggle";
import { cn } from "@/utils/cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NAV } from "./data";
import { CloseIcon, SidebarExpandedIcon } from "./icon";
import NavItem from "./nav-item";

function LogoutIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M6.75 15.75H5.25a3 3 0 0 1-3-3v-7.5a3 3 0 0 1 3-3h1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 12.375 15.375 9 12 5.625M15 9H7.125"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Sidebar({
  isSidebarOpen,
  toggleSidebar,
  isMobileSheet = false,
  onItemClick,
}: {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isMobileSheet?: boolean;
  onItemClick?: () => void;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const logout = async () => {
    setLeaving(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className={cn(
          "flex items-center px-4 pt-7 text-text-primary",
          isSidebarOpen ? "justify-between" : "flex-col justify-center gap-4",
        )}
      >
        <Link href="/" onClick={onItemClick} aria-label="ficonpa">
          {isSidebarOpen ? <BrandWithText /> : <BrandMark />}
        </Link>

        <button
          onClick={toggleSidebar}
          className={cn(
            "rounded-lg p-1.5 text-icon-tertiary transition-colors",
            isMobileSheet
              ? "hover:bg-background-gray-primary hover:text-text-primary"
              : "hover:text-text-secondary",
          )}
          aria-label={isMobileSheet ? "Fechar menu" : isSidebarOpen ? "Recolher menu" : "Abrir menu"}
        >
          {isMobileSheet ? <CloseIcon /> : <SidebarExpandedIcon />}
        </button>
      </div>

      <nav
        aria-label="Principal"
        className={cn(
          "scrollbar-thin flex-1 overflow-y-auto",
          isSidebarOpen ? "mt-8 space-y-1 px-4" : "mt-6 space-y-1.5 px-2",
        )}
      >
        {NAV.map((item) => (
          <NavItem key={item.url} item={item} collapsed={!isSidebarOpen} onItemClick={onItemClick} />
        ))}
      </nav>

      <div
        className={cn(
          "flex items-center gap-2 py-4",
          isSidebarOpen ? "justify-between px-4" : "flex-col px-2",
        )}
      >
        <button
          onClick={logout}
          disabled={leaving}
          aria-label="Sair"
          title={isSidebarOpen ? undefined : "Sair"}
          className={cn(
            "flex items-center gap-3 rounded-lg text-sm font-medium text-text-secondary transition-colors hover:bg-sidebar-navigation-nav-item-nav-hover-background hover:text-text-primary disabled:opacity-60",
            isSidebarOpen ? "px-3 py-2" : "px-3 py-2.5",
          )}
        >
          <span className="text-icon-tertiary">
            <LogoutIcon />
          </span>
          {isSidebarOpen && <span>{leaving ? "Saindo…" : "Sair"}</span>}
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}
