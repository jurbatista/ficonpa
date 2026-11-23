import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Proteção contra SSRF: links vêm de e-mails (não confiáveis), então nunca
 * deixamos o servidor acessar a rede interna, loopback ou metadados de nuvem.
 */

export class BlockedUrlError extends Error {}
/** DNS não resolveu: tratado como "fora do ar" (pode voltar), não como bloqueio. */
export class HostUnreachableError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inRange(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const PRIVATE_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return PRIVATE_V4.some((cidr) => inRange(ip, cidr));
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("ff")
  );
}

type HostStatus = "public" | "private" | "unresolved";
const hostCache = new Map<string, { status: HostStatus; at: number }>();

export async function hostStatus(hostname: string): Promise<HostStatus> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return "private";
  }
  if (isIP(host)) return isPrivateIp(host) ? "private" : "public";

  const cached = hostCache.get(host);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.status;

  let status: HostStatus;
  try {
    const addresses = await lookup(host, { all: true });
    status =
      addresses.length === 0
        ? "unresolved"
        : addresses.every((item) => !isPrivateIp(item.address))
          ? "public"
          : "private";
  } catch {
    status = "unresolved";
  }
  // Falha de DNS fica pouco tempo em cache, para tentar de novo logo.
  hostCache.set(host, { status, at: status === "unresolved" ? Date.now() - 4 * 60_000 : Date.now() });
  return status;
}

/** Resolve o host e garante que todos os IPs são públicos. */
export async function isPublicHost(hostname: string): Promise<boolean> {
  return (await hostStatus(hostname)) === "public";
}

/** Só https em porta padrão e host público. Lança BlockedUrlError caso contrário. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError(`URL inválida: ${raw.slice(0, 200)}`);
  }
  if (url.protocol !== "https:") throw new BlockedUrlError("Apenas links https são aceitos.");
  if (url.username || url.password) throw new BlockedUrlError("URL com credenciais embutidas.");
  if (url.port && url.port !== "443") throw new BlockedUrlError("Porta não permitida.");
  const status = await hostStatus(url.hostname);
  if (status === "unresolved") throw new HostUnreachableError(`Domínio não encontrado (DNS): ${url.hostname}`);
  if (status === "private") throw new BlockedUrlError(`Host não permitido: ${url.hostname}`);
  return url;
}

export type SafeFetchResult = {
  status: number;
  finalUrl: string;
  contentType: string;
  body: Buffer;
};

/**
 * fetch com redirecionamentos validados um a um, limite de tamanho e timeout.
 */
export async function safeFetch(
  raw: string,
  options: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; method?: string } = {},
): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? 15 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  let current = raw;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertSafeUrl(current);
    const response = await fetch(current, {
      method: options.method ?? "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        Accept: "text/html,application/pdf,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error(`Redirecionamento ${response.status} sem destino.`);
      current = new URL(location, current).toString();
      continue;
    }

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Resposta grande demais (${declared} bytes).`);
    }

    const chunks: Buffer[] = [];
    let total = 0;
    if (response.body) {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > maxBytes) throw new Error("Resposta grande demais.");
        chunks.push(Buffer.from(chunk));
      }
    }

    return {
      status: response.status,
      finalUrl: current,
      contentType: response.headers.get("content-type") ?? "",
      body: Buffer.concat(chunks),
    };
  }
  throw new Error("Redirecionamentos demais.");
}

export function isPdfBuffer(buffer: Buffer | null | undefined): boolean {
  return Boolean(buffer && buffer.length > 100 && buffer.subarray(0, 5).toString("latin1") === "%PDF-");
}
