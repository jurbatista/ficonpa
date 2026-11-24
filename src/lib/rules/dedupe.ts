import { and, eq, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents, payables, type PayableRow } from "@/db/schema";
import { boletoTitleKey } from "@/lib/boleto/linha-digitavel";
import { getConnection } from "@/lib/contaazul/connection";
import { searchContaAzulPayables } from "@/lib/contaazul/payables";
import { formatBRL, formatDate } from "@/lib/format";
import { getSettings, type AppSettings } from "@/lib/settings";

/** A cobrança que está para ser lançada. */
export type Charge = {
  supplierId: string;
  value: number;
  /** YYYY-MM-DD */
  dueDate: string;
  linhaDigitavel?: string | null;
  /** Valor antes de juros e multa, quando o documento informa. */
  originalValue?: number | null;
  /** Vencimento original, quando o documento informa. */
  originalDueDate?: string | null;
  /** O documento se apresenta como reenvio de cobrança vencida? null = não se sabe. */
  reissue?: boolean | null;
};

/** Uma cobrança do mesmo fornecedor que chegou antes. */
export type PriorCharge = {
  source: "local" | "conta-azul";
  value: number;
  /** YYYY-MM-DD */
  dueDate: string;
  /** Já está no Conta Azul (lançada por aqui ou direto lá). */
  posted: boolean;
  /** null = não se sabe. */
  paid: boolean | null;
  linhaDigitavel?: string | null;
};

export type PriorMatch = {
  /** duplicate = é a mesma cobrança; suspect = pode ser, uma pessoa decide. */
  kind: "duplicate" | "suspect";
  /** same = idêntica; reissue = reenviada com outro vencimento ou valor; similar = parecida. */
  reason: "same" | "reissue" | "similar";
  prior: PriorCharge;
  /** Frase que aparece na tela. */
  note: string;
};

export type MatchOptions = {
  /** Reenvio de cobrança atrasada conta como a mesma cobrança. */
  reissue: boolean;
  windowDays: number;
  maxIncreasePercent: number;
  /** YYYY-MM-DD; padrão: hoje em Brasília. */
  today?: string;
};

export const UNVERIFIED_NOTE = "Não foi possível conferir no Conta Azul se a cobrança já existe.";
export const RULE_DISCARD_NOTE = "Descartado por regra.";
export const RULE_REVIEW_NOTE = "Uma regra pede conferência.";

/** As frases acima e as de `matchPriorCharge` vão para a tela como estão. */
export const PLAIN_NOTE =
  /^(Já lançada no Conta Azul|Já está na lista|Reenvio de cobrança|Pode ser a mesma cobrança|Descartado por regra|Uma regra pede conferência|Não foi possível conferir no Conta Azul)/;

/** Mesmo valor com vencimento a poucos dias: provavelmente a mesma cobrança digitada com outra data. */
const NEAR_DAYS = 5;

const cents = (value: number) => Math.round(value * 100);
const onlyDigits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function todayInBrazil(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function describe(prior: PriorCharge): string {
  return `(venc. ${formatDate(prior.dueDate)}, ${formatBRL(prior.value)})`;
}

function found(kind: PriorMatch["kind"], reason: PriorMatch["reason"], prior: PriorCharge): PriorMatch {
  const where = prior.posted ? "já lançada" : "que já está na lista";
  const note =
    reason === "same"
      ? `${prior.posted ? "Já lançada no Conta Azul" : "Já está na lista"} ${describe(prior)}.`
      : kind === "duplicate"
        ? `Reenvio de cobrança ${where} ${describe(prior)}.`
        : `Pode ser a mesma cobrança ${where} ${describe(prior)}.`;
  return { kind, reason, prior, note };
}

/**
 * Compara a cobrança com as anteriores do mesmo fornecedor. Vale sempre a primeira:
 *
 * 1. Mesma linha digitável, ou mesmo valor e vencimento → é a mesma cobrança.
 * 2. Com `reissue` ligado, também é a mesma cobrança quando:
 *    - é o mesmo título no banco (boleto reemitido com outro vencimento ou valor);
 *    - o documento informa o vencimento original e ele bate com uma cobrança anterior;
 *    - o documento informa o valor antes dos juros (ou se apresenta como reenvio) e existe
 *      uma cobrança anterior em aberto com esse valor.
 * 3. Sem prova, mas parecida (valor maior dentro do limite de juros sobre uma cobrança
 *    vencida e em aberto, ou mesmo valor com vencimento a poucos dias) → suspeita.
 */
export function matchPriorCharge(
  charge: Charge,
  candidates: PriorCharge[],
  options: MatchOptions,
): PriorMatch | null {
  const today = options.today ?? todayInBrazil();
  // O que já está no Conta Azul vem antes; depois, o vencimento mais recente.
  const sorted = [...candidates].sort(
    (a, b) => Number(b.posted) - Number(a.posted) || b.dueDate.localeCompare(a.dueDate),
  );

  const linha = onlyDigits(charge.linhaDigitavel);
  const same = sorted.find(
    (prior) =>
      (linha.length >= 44 && onlyDigits(prior.linhaDigitavel) === linha) ||
      (cents(prior.value) === cents(charge.value) && prior.dueDate === charge.dueDate),
  );
  if (same) return found("duplicate", "same", same);

  let suspect: PriorCharge | undefined;

  if (options.reissue) {
    const title = boletoTitleKey(charge.linhaDigitavel);
    const sameTitle = title
      ? sorted.find((prior) => boletoTitleKey(prior.linhaDigitavel) === title)
      : undefined;
    if (sameTitle) return found("duplicate", "reissue", sameTitle);

    const originalDueDate = charge.originalDueDate ?? null;
    const originalValue =
      charge.originalValue && cents(charge.originalValue) < cents(charge.value)
        ? charge.originalValue
        : null;
    const limit = 1 + options.maxIncreasePercent / 100;

    const earlier = sorted.filter(
      (prior) =>
        prior.dueDate < charge.dueDate &&
        daysBetween(prior.dueDate, charge.dueDate) <= options.windowDays &&
        cents(charge.value) >= cents(prior.value) &&
        cents(charge.value) <= Math.round(cents(prior.value) * limit),
    );

    const byOriginalDate = originalDueDate
      ? earlier.find((prior) => prior.dueDate === originalDueDate)
      : undefined;
    if (byOriginalDate) return found("duplicate", "reissue", byOriginalDate);

    for (const prior of earlier) {
      const interest = cents(charge.value) > cents(prior.value);
      if (!interest) continue;
      const open = prior.paid !== true;
      const valueMatches = originalValue !== null && cents(originalValue) === cents(prior.value);
      // O documento não pode contradizer a cobrança anterior.
      const proven =
        open &&
        !originalDueDate &&
        (valueMatches || (charge.reissue === true && originalValue === null));
      if (proven) return found("duplicate", "reissue", prior);

      const likely = valueMatches || charge.reissue === true || (open && prior.dueDate < today);
      if (likely && !suspect) suspect = prior;
    }
  }

  suspect ??= sorted.find(
    (prior) =>
      cents(prior.value) === cents(charge.value) &&
      Math.abs(daysBetween(prior.dueDate, charge.dueDate)) <= NEAR_DAYS,
  );

  return suspect ? found("suspect", "similar", suspect) : null;
}

type Reader = Pick<ReturnType<typeof getDb>, "select">;

/** Cobranças do fornecedor que já passaram por aqui (menos as descartadas). */
export async function localPriorCharges(
  db: Reader,
  input: { supplierId: string; documentId?: string; createdBefore?: Date },
): Promise<PriorCharge[]> {
  const conditions = [eq(payables.supplierId, input.supplierId), ne(payables.status, "REJECTED")];
  // O lançamento do próprio documento não conta, nem o que chegou depois dele.
  if (input.documentId) conditions.push(ne(payables.documentId, input.documentId));
  if (input.createdBefore) conditions.push(lt(payables.createdAt, input.createdBefore));

  const rows = await db
    .select({
      value: payables.value,
      dueDate: payables.dueDate,
      status: payables.status,
      linhaDigitavel: sql<string | null>`${documents.extraction}->>'linhaDigitavel'`,
    })
    .from(payables)
    .innerJoin(documents, eq(documents.id, payables.documentId))
    .where(and(...conditions));

  return rows.flatMap((row) =>
    row.value && row.dueDate
      ? [
          {
            source: "local" as const,
            value: Number(row.value),
            dueDate: row.dueDate,
            posted: row.status === "POSTED",
            paid: null,
            linhaDigitavel: row.linhaDigitavel,
          },
        ]
      : [],
  );
}

/** Cobranças do fornecedor que já estão no Conta Azul, com vencimento perto do desta. */
export async function remotePriorCharges(input: {
  supplierId: string;
  dueDate: string;
  windowDays: number;
}): Promise<PriorCharge[]> {
  // Meses inteiros: boletos com vencimentos próximos reaproveitam a mesma consulta.
  const from = `${addDays(input.dueDate, -input.windowDays).slice(0, 7)}-01`;
  const lastMonth = addDays(input.dueDate, NEAR_DAYS).slice(0, 7);
  const to = addDays(`${addDays(`${lastMonth}-28`, 4).slice(0, 7)}-01`, -1);

  const items = await searchContaAzulPayables({ from, to });
  return items
    .filter((item) => item.supplierId === input.supplierId)
    .map((item) => ({
      source: "conta-azul" as const,
      value: item.value,
      dueDate: item.dueDate,
      posted: true,
      paid: item.paid,
    }));
}

type CheckSettings = Pick<
  AppSettings,
  "duplicateCheckEnabled" | "reissueCheckEnabled" | "reissueWindowDays" | "reissueMaxIncreasePercent"
>;

function matchOptions(settings: CheckSettings): MatchOptions {
  return {
    reissue: settings.reissueCheckEnabled,
    windowDays: settings.reissueWindowDays,
    maxIncreasePercent: settings.reissueMaxIncreasePercent,
  };
}

/**
 * O que existe no Conta Azul para comparar. `unverified` avisa que a consulta
 * falhou: sem ela não dá para garantir que a cobrança é nova.
 */
export async function loadRemotePriorCharges(
  charge: Pick<Charge, "supplierId" | "dueDate">,
  settings: CheckSettings,
): Promise<{ charges: PriorCharge[]; unverified: boolean }> {
  if (!settings.duplicateCheckEnabled || !(await getConnection())) {
    return { charges: [], unverified: false };
  }
  try {
    const charges = await remotePriorCharges({
      supplierId: charge.supplierId,
      dueDate: charge.dueDate,
      windowDays: settings.reissueCheckEnabled ? settings.reissueWindowDays : NEAR_DAYS,
    });
    return { charges, unverified: false };
  } catch (error) {
    console.error(
      "[conferência] consulta ao Conta Azul falhou:",
      error instanceof Error ? error.message : String(error),
    );
    return { charges: [], unverified: true };
  }
}

export function matchWithSettings(
  charge: Charge,
  candidates: PriorCharge[],
  settings: CheckSettings,
): PriorMatch | null {
  return matchPriorCharge(charge, candidates, matchOptions(settings));
}

export type PriorCheck = {
  match: PriorMatch | null;
  unverified: boolean;
};

/** O que impede o lançamento, em uma frase; null quando nada impede. */
export function priorCheckNote(check: PriorCheck): string | null {
  return check.match?.note ?? (check.unverified ? UNVERIFIED_NOTE : null);
}

/**
 * O aviso que acompanha um lançamento na tela depois de editado ou restaurado.
 * Se a conferência falhar por qualquer motivo, fica sem aviso: quem barra é o lançamento.
 */
export async function priorChargeNote(payable: PayableRow): Promise<string | null> {
  try {
    return priorCheckNote(await checkPayablePriorCharge(payable, await getSettings()));
  } catch {
    return null;
  }
}

/** Confere um lançamento que já está na fila, logo antes de ir para o Conta Azul. */
export async function checkPayablePriorCharge(
  payable: PayableRow,
  settings: CheckSettings,
): Promise<PriorCheck> {
  if (!payable.supplierId || !payable.value || !payable.dueDate) {
    return { match: null, unverified: false };
  }
  const db = getDb();
  const [document] = await db
    .select({ extraction: documents.extraction })
    .from(documents)
    .where(eq(documents.id, payable.documentId))
    .limit(1);
  const extraction = (document?.extraction ?? {}) as {
    linhaDigitavel?: string | null;
    originalValue?: number | null;
    originalDueDate?: string | null;
    reissue?: boolean | null;
  };

  const charge: Charge = {
    supplierId: payable.supplierId,
    value: Number(payable.value),
    dueDate: payable.dueDate,
    linhaDigitavel: extraction.linhaDigitavel ?? null,
    originalValue: extraction.originalValue ?? null,
    originalDueDate: extraction.originalDueDate ?? null,
    reissue: extraction.reissue ?? null,
  };

  const [local, remote] = await Promise.all([
    localPriorCharges(db, {
      supplierId: payable.supplierId,
      documentId: payable.documentId,
      createdBefore: payable.createdAt,
    }),
    loadRemotePriorCharges(charge, settings),
  ]);

  return {
    match: matchWithSettings(charge, [...local, ...remote.charges], settings),
    unverified: remote.unverified,
  };
}
