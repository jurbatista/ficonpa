/**
 * Generalização de URLs: transforma "https://www.asaas.com/i/z55w23bwlqp716hn"
 * em host "www.asaas.com" + padrão "/i/{}" e expõe as partes variáveis como
 * variáveis ({{seg1}}, {{q.nh}}, {{url}}) para os passos das receitas.
 */

export type UrlVars = Record<string, string>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Um segmento é "variável" quando parece um identificador e não uma palavra fixa. */
export function isVariableSegment(segment: string): boolean {
  const value = decodeURIComponent(segment);
  if (!value) return false;
  if (UUID_RE.test(value)) return true;
  if (/^\d{3,}$/.test(value)) return true;
  if (value.length >= 6 && /\d/.test(value) && /^[\w.~=+-]+$/.test(value)) return true;
  if (value.length >= 16 && /[a-z]/.test(value) && /[A-Z]/.test(value)) return true;
  if (value.length >= 24) return true;
  return false;
}

export function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

export function urlPattern(raw: string): { host: string; pathPattern: string } {
  const url = new URL(raw);
  const pattern = pathSegments(url)
    .map((segment) => (isVariableSegment(segment) ? "{}" : segment.toLowerCase()))
    .join("/");
  return { host: url.hostname.toLowerCase(), pathPattern: `/${pattern}` };
}

export function patternMatches(pathPattern: string, raw: string): boolean {
  const expected = pathPattern.split("/").filter(Boolean);
  const actual = pathSegments(new URL(raw));
  if (expected.length !== actual.length) return false;
  return expected.every(
    (part, index) => part === "{}" || part === actual[index].toLowerCase(),
  );
}

export function urlVars(raw: string): UrlVars {
  const url = new URL(raw);
  const vars: UrlVars = { url: url.toString(), origin: url.origin, host: url.hostname };
  pathSegments(url).forEach((segment, index) => {
    vars[`seg${index}`] = decodeURIComponent(segment);
  });
  url.searchParams.forEach((value, key) => {
    if (/^[\w.-]+$/.test(key)) vars[`q.${key}`] = value;
  });
  return vars;
}

export function renderTemplate(template: string, vars: UrlVars): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, name: string) => {
    if (!(name in vars)) throw new Error(`Variável {{${name}}} ausente no link.`);
    return vars[name];
  });
}

/**
 * Substitui, numa URL descoberta durante a navegação, os trechos que vieram do link
 * original pelas variáveis correspondentes. Ex.: com seg1 = "z55w23bwlqp716hn",
 * "https://www.asaas.com/b/pdf/z55w23bwlqp716hn" vira "https://www.asaas.com/b/pdf/{{seg1}}".
 * Retorna null se a URL ainda tiver partes variáveis que não vieram do link original
 * (nesse caso não dá para reconstruí-la só a partir do link: é preciso navegar).
 */
export function templatizeUrl(target: string, vars: UrlVars): string | null {
  let template = target;
  const candidates = Object.entries(vars)
    .filter(([name, value]) => !["url", "origin", "host"].includes(name) && value.length >= 4)
    .sort((a, b) => b[1].length - a[1].length);

  for (const [name, value] of candidates) {
    for (const form of new Set([value, encodeURIComponent(value)])) {
      if (template.includes(form)) template = template.split(form).join(`{{${name}}}`);
    }
  }

  const leftover = new URL(template.replace(/\{\{[\w.-]+\}\}/g, "x"));
  const leftoverVariable =
    pathSegments(leftover).some((segment) => isVariableSegment(segment)) ||
    [...leftover.searchParams.values()].some((value) => isVariableSegment(value));
  return leftoverVariable ? null : template;
}
