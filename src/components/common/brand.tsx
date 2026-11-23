import { cn } from "@/utils/cn";

/**
 * A marca: as barras de um boleto que terminam num "feito".
 * A mesma geometria está em src/app/icon.svg, de onde saem o favicon e os ícones
 * de app (npm run brand:build). Ao mudar uma, mude a outra.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-9 shrink-0", className)}>
      <rect width="64" height="64" rx="14" className="fill-button-primary-background" />
      <g fill="#fff" fillOpacity=".7">
        <rect x="6" y="22" width="6" height="26" rx="1.5" />
        <rect x="16" y="22" width="2" height="26" rx="1" />
        <rect x="22" y="22" width="6" height="26" rx="1.5" />
      </g>
      <path
        d="M34.75 37.5 41 45.25 53.5 18.75"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
