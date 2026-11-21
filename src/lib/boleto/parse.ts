import { extractText, getDocumentProxy } from "unpdf";
import { findLinhaDigitavel, parseBankBoleto, type ParsedBankBoleto } from "./linha-digitavel";

export type PdfText = {
  text: string;
  pages: number;
  hasTextLayer: boolean;
};

export async function extractPdfText(buffer: Buffer): Promise<PdfText> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractText(pdf, { mergePages: true });
  const text = (Array.isArray(result.text) ? result.text.join("\n") : result.text) ?? "";
  return {
    text,
    pages: result.totalPages ?? 0,
    hasTextLayer: text.replace(/\s/g, "").length > 40,
  };
}

export type BoletoTextData = {
  linhaDigitavel: string | null;
  bank: ParsedBankBoleto | null;
  cnpj: string | null;
  cpf: string | null;
  valueFromText: number | null;
  dueDateFromText: string | null;
  beneficiaryHint: string | null;
};

export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const calc = (slice: number) => {
    const weights =
      slice === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, index) => acc + Number(digits[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const calc = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

function parseBrl(value: string): number | null {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBoletoText(text: string): BoletoTextData {
  const linhaDigitavel = findLinhaDigitavel(text);
  const bank = linhaDigitavel ? parseBankBoleto(linhaDigitavel) : null;

  const cnpjMatch = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? [];
  const cnpj = cnpjMatch.find((candidate) => isValidCnpj(candidate)) ?? null;

  const cpfMatch = text.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) ?? [];
  const cpf = cpfMatch.find((candidate) => isValidCpf(candidate)) ?? null;

  const valueMatches = [
    ...text.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g),
  ];
  const valueFromText = valueMatches.length
    ? parseBrl(valueMatches[valueMatches.length - 1][1])
    : null;

  const dueMatch = text.match(
    /(?:vencimento|vence|venc\.?)[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/i,
  );
  const anyDate = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  const dueDateBr = dueMatch?.[1] ?? anyDate?.[1] ?? null;
  const dueDateFromText = dueDateBr
    ? `${dueDateBr.slice(6, 10)}-${dueDateBr.slice(3, 5)}-${dueDateBr.slice(0, 2)}`
    : null;

  const beneficiaryMatch = text.match(/benefici[aá]ri[oa]\s*[:\-]?\s*([^\n\r]{3,120})/i);

  return {
    linhaDigitavel,
    bank,
    cnpj,
    cpf,
    valueFromText,
    dueDateFromText,
    beneficiaryHint: beneficiaryHintCleanup(beneficiaryMatch?.[1] ?? null),
  };
}

function beneficiaryHintCleanup(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/\s+/g, " ")
    .replace(/(cnpj|cpf).*$/i, "")
    .trim()
    .slice(0, 120);
}
