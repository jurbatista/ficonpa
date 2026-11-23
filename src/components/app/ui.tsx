import { Badge } from "@/components/tailgrids/core/badge";
import { Card } from "@/components/tailgrids/core/card";
import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

export const fieldClass =
  "w-full rounded-lg border border-card-border bg-input-background px-3.5 py-2.5 text-sm text-title-50 outline-none transition placeholder:text-input-placeholder-text focus:border-input-primary-focus-border focus:ring-4 focus:ring-input-primary-focus-border/20 disabled:cursor-not-allowed disabled:opacity-60";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-6 pb-5 lg:px-7">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h2>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-0", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border px-5 py-4">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            )}
            {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </Card>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "error" | "info";
}) {
  const tones: Record<string, string> = {
    default: "text-text-primary",
    success: "text-success-500",
    warning: "text-warning-500",
    error: "text-error-500",
    info: "text-info-500",
  };
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </Card>
  );
}

type BadgeColor =
  | "gray"
  | "primary"
  | "error"
  | "warning"
  | "success"
  | "cyan"
  | "sky"
  | "blue"
  | "violet"
  | "purple"
  | "pink"
  | "rose"
  | "orange";

const STATUS: Record<string, { label: string; color: BadgeColor }> = {
  DRAFT: { label: "Rascunho", color: "gray" },
  APPROVED: { label: "Aprovado", color: "blue" },
  POSTED: { label: "Lançado", color: "success" },
  FAILED: { label: "Falhou", color: "error" },
  REJECTED: { label: "Rejeitado", color: "gray" },
  PENDING: { label: "Processando", color: "sky" },
  NOT_BOLETO: { label: "Não é boleto", color: "gray" },
  NO_SUPPLIER: { label: "Sem fornecedor", color: "warning" },
  NEEDS_ATTENTION: { label: "Atenção", color: "warning" },
  READY: { label: "Pronto", color: "primary" },
  DUPLICATE: { label: "Duplicado", color: "violet" },
  ERROR: { label: "Erro", color: "error" },
  RESOLVING: { label: "Buscando boleto", color: "sky" },
  RESOLVED: { label: "Boleto obtido", color: "success" },
  CAPTCHA: { label: "Captcha", color: "warning" },
  UNAVAILABLE: { label: "Fora do ar", color: "orange" },
  NOT_FOUND: { label: "Sem boleto", color: "gray" },
  NEEDS_HUMAN: { label: "Precisa de você", color: "warning" },
  BLOCKED: { label: "Bloqueado", color: "error" },
};

export function StatusBadge({ status }: { status: string }) {
  const item = STATUS[status] ?? { label: status, color: "gray" as BadgeColor };
  return (
    <Badge color={item.color} size="sm">
      {item.label}
    </Badge>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-card-border px-6 py-12 text-center">
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-text-secondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
