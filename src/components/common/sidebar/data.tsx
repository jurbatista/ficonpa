import { GearIcon } from "@/components/common/header/icons";
import type { ReactNode } from "react";
import {
  HomeIcon,
  InvoiceIcon,
  LetterIcon,
  UserGroupIcon,
} from "./icon";

type NavEntry = {
  title: string;
  url?: string;
  icon: ReactNode;
  items: Array<{ title: string; url?: string }>;
};

type NavSection = {
  label: string;
  items: NavEntry[];
};

export const NAV_DATA: NavSection[] = [
  {
    label: "OPERAÇÃO",
    items: [
      {
        title: "Painel",
        url: "/",
        icon: <HomeIcon />,
        items: [],
      },
      {
        title: "Contas a pagar",
        url: "/contas-a-pagar",
        icon: <InvoiceIcon />,
        items: [],
      },
    ],
  },
  {
    label: "CONEXÕES",
    items: [
      {
        title: "E-mails",
        url: "/conexoes/emails",
        icon: <LetterIcon />,
        items: [],
      },
      {
        title: "Conta Azul",
        url: "/conexoes/conta-azul",
        icon: <UserGroupIcon />,
        items: [],
      },
    ],
  },
  {
    label: "SISTEMA",
    items: [
      {
        title: "Configurações",
        url: "/configuracoes",
        icon: <GearIcon />,
        items: [],
      },
    ],
  },
];
