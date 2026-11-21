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

export async function fetchAllPages<T = Record<string, unknown>>(
  path: string,
  pageSize = 100,
  maxPages = 50,
): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await caJson<unknown>(
      `${path}${separator}pagina=${page}&tamanho_pagina=${pageSize}`,
    );
    const items = asArray<T>(payload);
    results.push(...items);
    if (items.length < pageSize) break;
  }
  return results;
}
