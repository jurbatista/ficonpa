import Link from "next/link";
import { btnPrimary } from "@/components/app/ui";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-card-background p-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">Página não encontrada</h1>
      <Link href="/" className={btnPrimary}>
        Ir para os boletos
      </Link>
    </div>
  );
}
