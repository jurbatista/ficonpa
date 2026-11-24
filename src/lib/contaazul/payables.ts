import { caJson, fetchAllPages } from "./client";

export type CreatePayableInput = {
  description: string;
  competenceDate: string;
  value: number;
  financialAccountId: string;
  supplierId: string;
  categoryId: string;
  costCenterId?: string | null;
  dueDate: string;
  externalReference: string;
  observation?: string;
};

export type CreatedPayable = {
  id: string;
  [key: string]: unknown;
};

export async function createContaAzulPayable(
  input: CreatePayableInput,
): Promise<CreatedPayable> {
  const rateio: Record<string, unknown> = {
    id_categoria: input.categoryId,
    valor: input.value,
  };
  if (input.costCenterId) {
    rateio.rateio_centro_custo = [
      { id_centro_custo: input.costCenterId, valor: input.value },
    ];
  }

  const body = {
    descricao: input.description,
    data_competencia: input.competenceDate,
    valor: input.value,
    conta_financeira: input.financialAccountId,
    id_fornecedor: input.supplierId,
    observacao: input.observation,
    referencia_externa: input.externalReference,
    rateio: [rateio],
    condicao_pagamento: {
      parcelas: [
        {
          descricao: "Parcela 1/1",
          data_vencimento: input.dueDate,
          conta_financeira: input.financialAccountId,
          detalhe_valor: { valor_bruto: input.value },
          metodo_pagamento: "BOLETO_BANCARIO",
        },
      ],
    },
  };

  const created = await caJson<CreatedPayable>("/v1/financeiro/contas-a-pagar", {
    method: "POST",
    body: JSON.stringify(body),
  });
  // O que acabou de ser lançado precisa aparecer na próxima conferência.
  searchCache.clear();
  return created;
}

type RawExistingPayable = {
  id?: string;
  descricao?: string;
  data_vencimento?: string;
  status?: string;
  status_traduzido?: string;
  total?: number;
  pago?: number;
  nao_pago?: number;
  fornecedor?: { id?: string; nome?: string } | null;
};

/** Parcela de conta a pagar que já existe no Conta Azul. */
export type ExistingPayable = {
  id: string;
  supplierId: string | null;
  description: string | null;
  /** YYYY-MM-DD */
  dueDate: string;
  value: number;
  /** null quando a resposta não deixa claro. */
  paid: boolean | null;
};

const PAID_STATUS = ["RECEBIDO", "QUITADO", "ACQUITTED", "PAID"];
const OPEN_STATUS = ["EM_ABERTO", "ATRASADO", "PENDENTE", "RECEBIDO_PARCIAL", "PENDING", "OVERDUE"];
const CANCELLED_STATUS = ["CANCELADO", "CANCELED", "CANCELLED"];

function toExisting(raw: RawExistingPayable): ExistingPayable[] {
  const dueDate = typeof raw.data_vencimento === "string" ? raw.data_vencimento.slice(0, 10) : "";
  const value = Number(raw.total);
  if (!raw.id || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(value) || value <= 0) {
    return [];
  }
  const statuses = [raw.status, raw.status_traduzido].map((item) => (item ?? "").toUpperCase());
  if (statuses.some((status) => CANCELLED_STATUS.includes(status))) return [];

  let paid: boolean | null = null;
  if (typeof raw.nao_pago === "number") paid = raw.nao_pago < 0.005;
  else if (statuses.some((status) => PAID_STATUS.includes(status))) paid = true;
  else if (statuses.some((status) => OPEN_STATUS.includes(status))) paid = false;

  return [
    {
      id: raw.id,
      supplierId: raw.fornecedor?.id ?? null,
      description: raw.descricao ?? null,
      dueDate,
      value,
      paid,
    },
  ];
}

const SEARCH_TTL_MS = 60_000;
const searchCache = new Map<string, { at: number; result: Promise<ExistingPayable[]> }>();

/**
 * Contas a pagar já lançadas no Conta Azul com vencimento no período (datas YYYY-MM-DD).
 * A API não filtra por fornecedor: quem chama filtra pelo `supplierId`.
 * Vários boletos chegam juntos e consultam o mesmo período, então a resposta
 * fica guardada por um minuto.
 */
export async function searchContaAzulPayables(range: {
  from: string;
  to: string;
}): Promise<ExistingPayable[]> {
  const key = `${range.from}|${range.to}`;
  const now = Date.now();
  for (const [cachedKey, entry] of searchCache) {
    if (now - entry.at >= SEARCH_TTL_MS) searchCache.delete(cachedKey);
  }
  const cached = searchCache.get(key);
  if (cached) return cached.result;

  const query = new URLSearchParams({
    data_vencimento_de: range.from,
    data_vencimento_ate: range.to,
  });
  const result = fetchAllPages<RawExistingPayable>(
    `/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${query.toString()}`,
  ).then((items) => items.flatMap(toExisting));
  searchCache.set(key, { at: now, result });
  result.catch(() => {
    if (searchCache.get(key)?.result === result) searchCache.delete(key);
  });
  return result;
}
