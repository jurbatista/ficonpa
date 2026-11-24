export const QWEN_SYSTEM_PROMPT = `Você é um especialista em documentos financeiros brasileiros. Analise o documento e extraia os dados do boleto com precisão.

Regras:
- Só marque is_boleto=true se for realmente um boleto bancário ou de convênio (arrecadação).
- Datas no formato YYYY-MM-DD.
- Valores em reais, apenas números decimais (ex.: 1234.56), sem "R$".
- O beneficiário é quem recebe; o pagador é quem paga.
- valor é o valor a pagar agora (valor cobrado), já com juros e multa se houver.
- valor_original é o valor do documento antes de juros, multa e encargos por atraso. Use null quando não houver acréscimo.
- vencimento_original é o vencimento anterior, quando o documento mostra que a cobrança venceu e foi reemitida com nova data. Use null quando não aparecer.
- reemissao=true quando o documento é o reenvio de uma cobrança já vencida: boleto atualizado, segunda via com nova data, ou valor acrescido de juros, multa ou encargos por atraso. Caso contrário, false.
- Se um campo não existir, retorne null e liste o nome do campo em campos_incertos.
- confianca é sua certeza global, de 0 a 1.
- Não invente dados.`;

export const QWEN_TEXT_PROMPT = `Extraia os dados deste boleto a partir do texto abaixo.

TEXTO DO PDF:
---
`;

export const QWEN_PDF_PROMPT = `Extraia os dados do boleto contido neste PDF.`;

export const qwenExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_boleto",
    "tipo",
    "beneficiario_nome",
    "beneficiario_documento",
    "valor",
    "vencimento",
    "valor_original",
    "vencimento_original",
    "reemissao",
    "banco",
    "nosso_numero",
    "linha_digitavel",
    "descricao",
    "confianca",
    "campos_incertos",
  ],
  properties: {
    is_boleto: { type: "boolean" },
    tipo: { type: "string", enum: ["bancario", "convenio", "desconhecido"] },
    beneficiario_nome: { type: ["string", "null"] },
    beneficiario_documento: { type: ["string", "null"] },
    valor: { type: ["number", "null"] },
    vencimento: { type: ["string", "null"] },
    valor_original: { type: ["number", "null"] },
    vencimento_original: { type: ["string", "null"] },
    reemissao: { type: "boolean" },
    banco: { type: ["string", "null"] },
    nosso_numero: { type: ["string", "null"] },
    linha_digitavel: { type: ["string", "null"] },
    descricao: { type: ["string", "null"] },
    confianca: { type: "number" },
    campos_incertos: { type: "array", items: { type: "string" } },
  },
} as const;

export const JEV_CRITERIA = {
  boletoTrue:
    "Documento com linha digitável, código de barras ou campos típicos de boleto (beneficiário, nosso número, vencimento, valor).",
  boletoFalse:
    "Nota fiscal, recibo, fatura de cartão, contrato, comprovante ou qualquer documento que não seja boleto.",
  documentTypes: {
    boleto_bancario: "Boleto emitido por banco, com linha digitável de 47 dígitos e código de barras.",
    boleto_convenio:
      "Boleto de convênio/arrecadação (concessionária, tributo), geralmente com 48 dígitos.",
    fatura: "Fatura de cartão de crédito ou demonstrativo, sem boleto.",
    recibo: "Recibo ou comprovante de pagamento já realizado.",
    outro: "Qualquer outro tipo de documento.",
  },
  autoPostTrue:
    "Os dados estão completos e consistentes, o fornecedor foi identificado por CNPJ exato e não há sinal de fraude, duplicidade ou divergência de valor/vencimento.",
  autoPostFalse:
    "Há qualquer dúvida, campo incerto, divergência entre o texto e os campos extraídos, fornecedor ambíguo ou risco de lançamento incorreto.",
  ruleDiscardTrue:
    "Alguma regra manda ignorar, descartar ou não lançar documentos como este, e o documento cumpre a condição da regra (fornecedor, remetente, tipo, valor ou assunto).",
  ruleDiscardFalse:
    "Nenhuma regra manda descartar este documento, ou as regras não tratam deste caso.",
  ruleReviewTrue:
    "Alguma regra exige conferência, aprovação ou revisão de uma pessoa para documentos como este, ou proíbe o lançamento automático deles.",
  ruleReviewFalse:
    "Nenhuma regra exige conferência de uma pessoa para este documento, ou as regras não tratam deste caso.",
  ruleRepeatTrue:
    "Alguma regra autoriza de forma explícita lançar de novo cobranças como esta, mesmo já existindo o primeiro lançamento.",
  ruleRepeatFalse:
    "Nenhuma regra autoriza isso de forma explícita. Sem regra explícita vale o primeiro lançamento e a cobrança não é lançada de novo.",
  qualityLevels: [
    "Incompleta: faltam valor ou vencimento, ou o documento não é legível.",
    "Parcial: campos principais presentes, mas beneficiário ou CNPJ incertos.",
    "Boa: todos os campos principais presentes e coerentes.",
    "Completa e consistente: todos os campos presentes, conferem com o texto e o beneficiário é inequívoco.",
  ],
} as const;
