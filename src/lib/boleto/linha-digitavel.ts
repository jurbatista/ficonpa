export type ParsedBankBoleto = {
  linhaDigitavel: string;
  barcode: string;
  bankCode: string;
  bankName: string;
  value: number | null;
  dueDate: string | null;
  dueFactor: number;
  valid: boolean;
};

const BANK_NAMES: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "036": "Banco Bradesco BBI",
  "041": "Banrisul",
  "070": "BRB",
  "077": "Banco Inter",
  "084": "Uniprime",
  "104": "Caixa Econômica Federal",
  "136": "Unicred",
  "197": "Stone",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "237": "Bradesco",
  "246": "Banco ABC Brasil",
  "260": "Nu Pagamentos",
  "290": "PagBank",
  "323": "Mercado Pago",
  "336": "C6 Bank",
  "341": "Itaú",
  "356": "Banco Real",
  "364": "Gerencianet",
  "380": "PicPay",
  "389": "Banco Mercantil",
  "399": "HSBC",
  "422": "Banco Safra",
  "453": "Banco Rural",
  "633": "Banco Rendimento",
  "637": "Banco Sofisa",
  "652": "Itaú Unibanco",
  "745": "Citibank",
  "748": "Sicredi",
  "756": "Sicoob",
  "955": "Banco Olé",
};

function mod10(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const product = Number(digits[index]) * weight;
    sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

function mod11(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  return remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
}

function fieldValid(field: string): boolean {
  if (field.length < 2) return false;
  return mod10(field.slice(0, -1)) === Number(field[field.length - 1]);
}

const BASE_DATE = Date.UTC(1997, 9, 7);
const NEW_CYCLE_DATE = Date.UTC(2025, 1, 22);

export function dueDateFromFactor(factor: number): string | null {
  if (!Number.isFinite(factor) || factor <= 0) return null;
  let timestamp = BASE_DATE + factor * 86_400_000;
  if (timestamp < NEW_CYCLE_DATE) timestamp += 9000 * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function parseBankBoleto(linhaDigitavel: string): ParsedBankBoleto | null {
  const digits = linhaDigitavel.replace(/\D/g, "");
  if (digits.length !== 47) return null;

  const field1 = digits.slice(0, 10);
  const field2 = digits.slice(10, 21);
  const field3 = digits.slice(21, 32);
  const generalDv = digits[32];
  const field5 = digits.slice(33, 47);

  const fieldsValid =
    fieldValid(field1) && fieldValid(field2) && fieldValid(field3);

  const campoLivre =
    digits.slice(4, 9) + digits.slice(10, 20) + digits.slice(21, 31);
  const barcodeWithoutDv = digits.slice(0, 4) + field5 + campoLivre;
  const barcode = digits.slice(0, 4) + generalDv + field5 + campoLivre;
  const dvValid = mod11(barcodeWithoutDv) === Number(generalDv);

  const bankCode = digits.slice(0, 3);
  const dueFactor = Number(field5.slice(0, 4));
  const cents = Number(field5.slice(4));
  const value = Number.isFinite(cents) && cents > 0 ? cents / 100 : null;

  return {
    linhaDigitavel: digits,
    barcode,
    bankCode,
    bankName: BANK_NAMES[bankCode] ?? `Banco ${bankCode}`,
    value,
    dueDate: dueDateFromFactor(dueFactor),
    dueFactor,
    valid: fieldsValid && dvValid,
  };
}

/**
 * Identidade do título no banco: código do banco + campo livre (carteira, nosso número,
 * agência e conta). Um boleto reemitido com novo vencimento ou com juros mantém esta
 * chave; o que muda na linha digitável é só o fator de vencimento e o valor.
 * Só existe para boletos bancários (47 dígitos).
 */
export function boletoTitleKey(linhaDigitavel: string | null | undefined): string | null {
  const digits = (linhaDigitavel ?? "").replace(/\D/g, "");
  if (digits.length !== 47) return null;
  const campoLivre = digits.slice(4, 9) + digits.slice(10, 20) + digits.slice(21, 31);
  if (/^0+$/.test(campoLivre)) return null;
  return `${digits.slice(0, 3)}:${campoLivre}`;
}

export function findLinhaDigitavel(text: string): string | null {
  const candidates = text.match(/(?:\d[\s.\-]?){47,48}/g) ?? [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length === 47) {
      const parsed = parseBankBoleto(digits);
      if (parsed?.valid) return digits;
    }
  }
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length === 48) return digits;
  }
  return null;
}
