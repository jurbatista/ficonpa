"use client";

import { BrandWithText } from "@/components/common/brand";
import { MenuIcon } from "@/components/common/header/icons";
import Link from "next/link";

/** Só aparece em telas estreitas; no computador o menu lateral já faz esse papel. */
export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-1 border-b-[0.5px] border-card-border bg-card-surface-area px-2 py-3 xl:hidden">
      <button
        onClick={onMenuClick}
        aria-label="Abrir menu"
        className="rounded-md px-1.5 py-1 text-icon-tertiary transition-colors hover:text-text-primary"
      >
        <MenuIcon />
      </button>
      <Link href="/" aria-label="ficonpa">
        <BrandWithText />
      </Link>
    </header>
  );
}
