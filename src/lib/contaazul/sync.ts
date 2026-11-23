import { count, max } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  categoriesCache,
  costCentersCache,
  financialAccountsCache,
  peopleCache,
} from "@/db/schema";
import { ContaAzulError, fetchAllPages } from "./client";
import { getConnection } from "./connection";

type RawPerson = {
  id?: string;
  nome?: string;
  documento?: string;
  email?: string;
  perfis?: unknown;
  ativo?: boolean;
};

type RawCategory = {
  id?: string;
  nome?: string;
  tipo?: string;
  categoria_pai?: unknown;
};

type RawAccount = {
  id?: string;
  nome?: string;
  banco?: string;
  tipo?: string;
  ativo?: boolean;
  conta_padrao?: boolean;
  padrao?: boolean;
};

type RawCostCenter = {
  id?: string;
  nome?: string;
  ativo?: boolean;
};

export type SyncResult = {
  people: number;
  categories: number;
  financialAccounts: number;
  costCenters: number;
  warnings: string[];
};

/** Busca a primeira rota que existir (a API mudou alguns caminhos entre versões). */
async function fetchFirst<T>(paths: string[]): Promise<T[]> {
  let lastError: unknown;
  for (const path of paths) {
    try {
      return await fetchAllPages<T>(path);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ContaAzulError) || error.status !== 404) throw error;
    }
  }
  throw lastError;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

async function syncPeople(now: Date): Promise<number> {
  const db = getDb();
  const people = (await fetchAllPages<RawPerson>("/v1/pessoas")).filter((item) => item.id);
  for (const person of people) {
    const values = {
      name: person.nome ?? "Sem nome",
      document: person.documento ?? null,
      email: person.email ?? null,
      profiles: (person.perfis ?? null) as never,
      active: person.ativo ?? true,
      syncedAt: now,
    };
    await db
      .insert(peopleCache)
      .values({ id: person.id!, ...values })
      .onConflictDoUpdate({ target: peopleCache.id, set: values });
  }
  return people.length;
}

async function syncCategories(now: Date): Promise<number> {
  const db = getDb();
  const categories = (
    await fetchFirst<RawCategory>([
      "/v1/financeiro/categorias?permite_apenas_filhos=false",
      "/v1/categorias?permite_apenas_filhos=false",
    ])
  ).filter((item) => item.id);
  for (const category of categories) {
    const values = {
      name: category.nome ?? "Sem nome",
      type: category.tipo ?? null,
      parentId: idOf(category.categoria_pai),
      syncedAt: now,
    };
    await db
      .insert(categoriesCache)
      .values({ id: category.id!, ...values })
      .onConflictDoUpdate({ target: categoriesCache.id, set: values });
  }
  return categories.length;
}

async function syncFinancialAccounts(now: Date): Promise<number> {
  const db = getDb();
  const accounts = (
    await fetchFirst<RawAccount>(["/v1/financeiro/contas-financeiras", "/v1/conta-financeira"])
  ).filter((item) => item.id);
  for (const account of accounts) {
    const values = {
      name: account.nome ?? "Conta",
      bank: account.banco ?? null,
      type: account.tipo ?? null,
      active: account.ativo ?? true,
      isDefault: account.conta_padrao ?? account.padrao ?? false,
      syncedAt: now,
    };
    await db
      .insert(financialAccountsCache)
      .values({ id: account.id!, ...values })
      .onConflictDoUpdate({ target: financialAccountsCache.id, set: values });
  }
  return accounts.length;
}

async function syncCostCenters(now: Date): Promise<number> {
  const db = getDb();
  const centers = (
    await fetchFirst<RawCostCenter>(["/v1/financeiro/centros-de-custo", "/v1/centro-de-custo"])
  ).filter((item) => item.id);
  for (const center of centers) {
    const values = {
      name: center.nome ?? "Centro de custo",
      active: center.ativo ?? true,
      syncedAt: now,
    };
    await db
      .insert(costCentersCache)
      .values({ id: center.id!, ...values })
      .onConflictDoUpdate({ target: costCentersCache.id, set: values });
  }
  return centers.length;
}

let lastSyncAt = 0;

/**
 * Atualiza os cadastros do Conta Azul. Fornecedores são essenciais: se falharem,
 * a sincronização falha. Os demais cadastros são independentes — um erro em
 * categorias não impede contas e centros de custo de serem atualizados.
 */
export async function syncContaAzulCatalogs(): Promise<SyncResult> {
  const warnings: string[] = [];
  const now = new Date();

  const optional = async (label: string, run: () => Promise<number>): Promise<number> => {
    try {
      return await run();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`Não foi possível atualizar ${label}: ${reason.slice(0, 200)}`);
      return 0;
    }
  };

  const people = await syncPeople(now);
  const categories = await optional("as categorias", () => syncCategories(now));
  const financialAccounts = await optional("as contas", () => syncFinancialAccounts(now));
  const costCenters = await optional("os centros de custo", () => syncCostCenters(now));

  lastSyncAt = Date.now();
  return { people, categories, financialAccounts, costCenters, warnings };
}

/**
 * Para as rotinas automáticas: só sincroniza se houver conexão e se a última
 * sincronização deste processo for mais antiga que `maxAgeMs`.
 */
export async function syncCatalogsIfConnected(maxAgeMs = 0): Promise<SyncResult | null> {
  if (maxAgeMs > 0 && Date.now() - lastSyncAt < maxAgeMs) return null;
  if (!(await getConnection())) return null;
  return syncContaAzulCatalogs();
}

export async function getCatalogStatus() {
  const db = getDb();
  const [[people], [categories], [accounts], [centers]] = await Promise.all([
    db.select({ total: count(), syncedAt: max(peopleCache.syncedAt) }).from(peopleCache),
    db.select({ total: count() }).from(categoriesCache),
    db.select({ total: count() }).from(financialAccountsCache),
    db.select({ total: count() }).from(costCentersCache),
  ]);
  return {
    people: Number(people?.total ?? 0),
    categories: Number(categories?.total ?? 0),
    financialAccounts: Number(accounts?.total ?? 0),
    costCenters: Number(centers?.total ?? 0),
    syncedAt: people?.syncedAt ?? null,
  };
}

/** Nome antigo, ainda usado pela tela do Conta Azul. */
export const countCatalogs = getCatalogStatus;
