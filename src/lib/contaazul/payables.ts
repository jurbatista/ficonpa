import { caJson } from "./client";

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

  return caJson<CreatedPayable>("/v1/financeiro/contas-a-pagar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
