import { CONTA_AZUL_API } from "./oauth";
import { forceRefresh, getValidAccessToken } from "./connection";

export class ContaAzulError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Conta Azul ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export async function caFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let token = await getValidAccessToken();

  const doRequest = (bearer: string) =>
    fetch(`${CONTA_AZUL_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

  let response = await doRequest(token);
  if (response.status === 401) {
    token = await forceRefresh();
    response = await doRequest(token);
  }
  return response;
}

export async function caJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await caFetch(path, init);
  const text = await response.text();
  if (!response.ok) throw new ContaAzulError(response.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

export function asArray<T = Record<string, unknown>>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["itens", "items", "data", "content"]) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

/** Total informado pela API (o nome do campo muda entre os módulos). */
function totalOf(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["totalItems", "itens_totais", "total_itens", "total"]) {
    if (typeof record[key] === "number") return record[key] as number;
  }
  return null;
}

async function fetchPages<T>(path: string, pageSize: number, maxPages: number): Promise<T[]> {
  const results: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await caJson<unknown>(
      `${path}${separator}pagina=${page}&tamanho_pagina=${pageSize}`,
    );
    const items = asArray<T>(payload);
    if (items.length === 0) break;
    results.push(...items);
    // Para pelo total informado; sem ele, para quando a página vier incompleta.
    const total = totalOf(payload);
    if (total !== null ? results.length >= total : items.length < pageSize) break;
  }
  return results;
}

export async function fetchAllPages<T = Record<string, unknown>>(
  path: string,
  pageSize = 100,
  maxPages = 200,
): Promise<T[]> {
  try {
    return await fetchPages<T>(path, pageSize, maxPages);
  } catch (error) {
    // Alguns módulos limitam o tamanho da página: tenta de novo com páginas menores.
    if (error instanceof ContaAzulError && error.status === 400 && pageSize > 20) {
      return fetchPages<T>(path, 20, maxPages * 5);
    }
    throw error;
  }
}
