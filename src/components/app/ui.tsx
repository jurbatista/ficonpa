import { Badge } from "@/components/tailgrids/core/badge";
import { Card } from "@/components/tailgrids/core/card";
import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

export const fieldClass =
  "w-full rounded-lg border border-card-border bg-input-background px-3.5 py-2.5 text-sm text-title-50 outline-none transition placeholder:text-input-placeholder-text focus:border-input-primary-focus-border focus:ring-4 focus:ring-input-primary-focus-border/20 disabled:cursor-not-allowed disabled:opacity-60";

/** Botões: um principal por tela; o resto é discreto. */
export const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-button-primary-background px-4 py-2.5 text-sm font-medium text-button-primary-text transition hover:bg-button-primary-hover-background disabled:cursor-not-allowed disabled:opacity-60";
export const btnOutline =
  "inline-flex items-center justify-center rounded-lg border border-card-border bg-card-background px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-background-gray-secondary_alt disabled:cursor-not-allowed disabled:opacity-60";
export const btnSmall =
  "inline-flex items-center justify-center rounded-lg border border-card-border bg-card-background px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60";
export const btnText =
  "text-sm font-medium text-text-secondary underline-offset-4 transition hover:text-text-primary hover:underline disabled:opacity-60";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-7 pb-5 lg:px-7">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-0", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold text-text-primary">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </Card>
  );
}

type BadgeColor = "gray" | "primary" | "error" | "warning" | "success" | "sky";

const STATUS: Record<string, { label: string; color: BadgeColor }> = {
  // Boletos
  DRAFT: { label: "Para revisar", color: "primary" },
  READY: { label: "Para revisar", color: "primary" },
  NEEDS_ATTENTION: { label: "Para revisar", color: "primary" },
  APPROVED: { label: "Lançando", color: "sky" },
  POSTED: { label: "Lançado", color: "success" },
  FAILED: { label: "Não lançou", color: "error" },
  REJECTED: { label: "Descartado", color: "gray" },
  PENDING: { label: "Lendo", color: "sky" },
  NO_SUPPLIER: { label: "Sem fornecedor", color: "warning" },
  ERROR: { label: "Não foi lido", color: "error" },
  NOT_BOLETO: { label: "Não é boleto", color: "gray" },
  DUPLICATE: { label: "Repetido", color: "gray" },
  // Links
  RESOLVING: { label: "Buscando", color: "sky" },
  RESOLVED: { label: "Baixado", color: "success" },
  CAPTCHA: { label: "Site pede confirmação", color: "warning" },
  NEEDS_HUMAN: { label: "Não baixou", color: "warning" },
  LINK_FAILED: { label: "Não baixou", color: "warning" },
  UNAVAILABLE: { label: "Site fora do ar", color: "gray" },
  NOT_FOUND: { label: "Sem boleto", color: "gray" },
  BLOCKED: { label: "Link recusado", color: "gray" },
};

export function StatusBadge({ status }: { status: string }) {
  const item = STATUS[status] ?? { label: status, color: "gray" as BadgeColor };
  return (
    <Badge color={item.color} size="sm" className="whitespace-nowrap">
      {item.label}
    </Badge>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-2 py-10 text-center text-sm text-text-secondary">{children}</p>;
}
