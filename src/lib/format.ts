/**
 * Datas sempre no horário de Brasília: o servidor roda em UTC e, sem isto,
 * a mesma tela mostraria horas diferentes no servidor e no navegador.
 */
const TIME_ZONE = "America/Sao_Paulo";

export function formatBRL(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(number);
}

/** Data sem hora (vencimento, competência). Aceita "2026-11-14" ou Date. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T12:00:00-03:00`) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TIME_ZONE }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(date);
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

/** Momento recente do jeito que se fala: "hoje, 14:02", "ontem, 09:10", "21/11, 09:10". */
export function formatWhen(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const time = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: TIME_ZONE }).format(date);
  if (dayKey(date) === dayKey(now)) return `hoje, ${time}`;
  if (dayKey(date) === dayKey(new Date(now.getTime() - 86_400_000))) return `ontem, ${time}`;
  const sameYear = dayKey(date).slice(0, 4) === dayKey(now).slice(0, 4);
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: TIME_ZONE,
  }).format(date);
  return `${day}, ${time}`;
}

/** "1797.00" → "1797,00" para edição. */
export function toInputBRL(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number.toFixed(2).replace(".", ",") : "";
}

/** Aceita "1.797,00", "1797,00" e "1797.00". Retorna null se não for um valor. */
export function parseBRL(text: string): number | null {
  const clean = text.replace(/[R$\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
}

/** CNPJ/CPF com máscara; qualquer outra coisa volta como veio. */
export function formatDocument(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return value;
}

/** Vencimento ("2026-11-14") já passou? */
export function isOverdue(dueDate: string | null | undefined): boolean {
  return Boolean(dueDate) && dueDate!.slice(0, 10) < dayKey(new Date());
}

/** Remetente como as pessoas leem: "Fulano <a@b.com>" → "Fulano". */
export function senderName(from: string | null | undefined): string | null {
  if (!from) return null;
  const name = from.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  if (name) return name;
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim() || null;
}
