import { GearIcon } from "@/components/common/header/icons";
import type { ReactNode } from "react";
import { InvoiceIcon, LetterIcon, LinkIcon } from "./icon";

export type NavEntry = {
  title: string;
  url: string;
  icon: ReactNode;
  /** Outros caminhos que também acendem este item. */
  also?: string[];
};

export const NAV: NavEntry[] = [
  { title: "Boletos", url: "/", also: ["/contas-a-pagar", "/conexoes/links"], icon: <InvoiceIcon /> },
  { title: "E-mails", url: "/conexoes/emails", icon: <LetterIcon /> },
  { title: "Conta Azul", url: "/conexoes/conta-azul", icon: <LinkIcon /> },
  { title: "Configurações", url: "/configuracoes", icon: <GearIcon /> },
];
