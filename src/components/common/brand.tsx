import { cn } from "@/utils/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-button-primary-background text-white shadow-sm",
        className,
      )}
      aria-hidden
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M4 3.5h9.5a2.5 2.5 0 0 1 0 5H4v-5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M4 11h6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function BrandWithText({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-lg font-semibold tracking-tight text-text-primary">ficonpa</span>
    </span>
  );
}
