/**
 * Encontra, no corpo de um e-mail, os links que provavelmente levam a um boleto.
 * O corpo é lido só em memória: apenas as URLs escolhidas são guardadas.
 */

export type LinkCandidate = {
  url: string;
  anchorText: string | null;
  score: number;
};

const BILLING_HOSTS = [
  "asaas.com",
  "gerencianet.com.br",
  "efipay.com.br",
  "sejaefi.com.br",
  "iugu.com",
  "pagar.me",
  "vindi.com.br",
  "cora.com.br",
  "pagseguro.uol.com.br",
  "pagbank.com.br",
  "mercadopago.com",
  "mercadopago.com.br",
  "bancointer.com.br",
  "inter.co",
  "sicoob.com.br",
  "sicredi.com.br",
  "omie.com.br",
  "contaazul.com",
  "boletobancario.com",
  "cobrefacil.com.br",
  "juno.com.br",
  "paghiper.com",
  "pjbank.com.br",
  "galaxpay.com.br",
  "superlogica.net",
  "zoop.com.br",
  "stone.com.br",
  "safe2pay.com.br",
  "bb.com.br",
  "itau.com.br",
  "bradesco.com.br",
  "santander.com.br",
  "caixa.gov.br",
];

/** Palavras que, sozinhas, já indicam cobrança. */
const BILLING_WORDS =
  /boleto|fatura|cobran[cç]a|2[ªa]\s*via|segunda via|t[ií]tulo|duplicata|invoice|mensalidade/i;

/** Verbos comuns em qualquer e-mail ("visualizar no navegador", "baixar o app"): só contam com outro sinal. */
const ACTION_WORDS = /pagar|pagamento|visualizar|imprimir|baixar|download|acessar|abrir|emitir/i;

const URL_BILLING = /boleto|fatura|cobranca|invoice|segunda-?via|2-?via|bankslip/i;
const URL_PAYMENT = /pagamento|payment|pagar|checkout|emissao|\/i\/|\/b\/|\/pay\b/i;

const BLOCKED =
  /unsubscribe|descadastr|cancelar[-_ ]?inscri|optout|opt-out|privacy|privacidade|politica|termos|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com\/|youtube\.com|whatsapp|wa\.me|t\.me\/|play\.google|apps\.apple|google\.com\/maps|\.(png|jpe?g|gif|svg|webp|ico|css|js)(\?|$)/i;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function hostMatches(host: string, list: string[]): boolean {
  return list.some((item) => host === item || host.endsWith(`.${item}`));
}

export function extractLinkCandidates(input: {
  html?: string | null;
  text?: string | null;
  subject?: string | null;
  knownHosts?: string[];
  max?: number;
}): LinkCandidate[] {
  const found = new Map<string, { anchor: string | null }>();

  if (input.html) {
    const anchorRe = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of input.html.matchAll(anchorRe)) {
      const url = decodeEntities(match[2].trim());
      const anchor = stripTags(match[3]).slice(0, 200) || null;
      if (!found.has(url)) found.set(url, { anchor });
    }
  }
  const plain = `${input.text ?? ""}\n${input.html ? stripTags(input.html) : ""}`;
  for (const match of plain.matchAll(/https:\/\/[^\s<>"')\]]+/gi)) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (!found.has(url)) found.set(url, { anchor: null });
  }

  // Mesmo endereço com e sem query string (ex.: href completo + URL escrita no texto): fica o primeiro.
  const seenPaths = new Set<string>();
  for (const raw of [...found.keys()]) {
    try {
      const url = new URL(raw);
      const key = `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
      if (seenPaths.has(key)) found.delete(raw);
      else seenPaths.add(key);
    } catch {
      found.delete(raw);
    }
  }

  // Um link só é candidato com pelo menos um sinal forte de cobrança: o site é de
  // cobrança, o texto do link fala em boleto/fatura, ou o assunto fala e o link é de ação.
  const billingSubject = Boolean(input.subject && BILLING_WORDS.test(input.subject));
  const knownHosts = input.knownHosts ?? [];
  const candidates: LinkCandidate[] = [];

  for (const [raw, { anchor }] of found) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    if (BLOCKED.test(raw) || (anchor && BLOCKED.test(anchor))) continue;

    const host = url.hostname.toLowerCase();
    const target = url.pathname + url.search;
    const known = hostMatches(host, knownHosts);
    const billingHost = hostMatches(host, BILLING_HOSTS);
    const billingAnchor = Boolean(anchor && BILLING_WORDS.test(anchor));
    const actionAnchor = Boolean(anchor && ACTION_WORDS.test(anchor));
    const billingUrl = URL_BILLING.test(target);

    const strong =
      known || billingHost || billingAnchor || billingUrl || (billingSubject && actionAnchor);
    if (!strong) continue;

    const score =
      (known ? 5 : 0) +
      (billingHost ? 3 : 0) +
      (billingAnchor ? 3 : 0) +
      (billingUrl ? 2 : 0) +
      (actionAnchor ? 1 : 0) +
      (URL_PAYMENT.test(target) ? 1 : 0) +
      (billingSubject ? 1 : 0);
    candidates.push({ url: url.toString(), anchorText: anchor, score });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, input.max ?? 2);
}
