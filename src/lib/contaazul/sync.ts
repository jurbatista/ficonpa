import { getDb } from "@/lib/db";
import {
  categoriesCache,
  costCentersCache,
  financialAccountsCache,
  peopleCache,
} from "@/db/schema";
import { asArray, fetchAllPages } from "./client";

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
  categoria_pai?: string;
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

export async function syncContaAzulCatalogs(): Promise<SyncResult> {
  const db = getDb();
  const warnings: string[] = [];
  const now = new Date();

  const people = await fetchAllPages<RawPerson>("/v1/pessoas");
  const validPeople = people.filter((item) => item.id);
  for (const person of validPeople) {
    await db
      .insert(peopleCache)
      .values({
        id: person.id!,
        name: person.nome ?? "Sem nome",
        document: person.documento ?? null,
        email: person.email ?? null,
        profiles: (person.perfis ?? null) as never,
        active: person.ativo ?? true,
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: peopleCache.id,
        set: {
          name: person.nome ?? "Sem nome",
          document: person.documento ?? null,
          email: person.email ?? null,
          profiles: (person.perfis ?? null) as never,
          active: person.ativo ?? true,
          syncedAt: now,
        },
      });
  }

  const categories = await fetchAllPages<RawCategory>(
    "/v1/categorias?permite_apenas_filhos=false",
  );
  const validCategories = categories.filter((item) => item.id);
  for (const category of validCategories) {
    await db
      .insert(categoriesCache)
      .values({
        id: category.id!,
        name: category.nome ?? "Sem nome",
        type: category.tipo ?? null,
        parentId: category.categoria_pai ?? null,
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: categoriesCache.id,
        set: {
          name: category.nome ?? "Sem nome",
          type: category.tipo ?? null,
          parentId: category.categoria_pai ?? null,
          syncedAt: now,
        },
      });
  }

  let financialAccounts: RawAccount[] = [];
  try {
    financialAccounts = await fetchAllPages<RawAccount>("/v1/financeiro/contas-financeiras");
  } catch {
    warnings.push("Não foi possível listar /v1/financeiro/contas-financeiras; tentando rota antiga.");
    financialAccounts = await fetchAllPages<RawAccount>("/v1/conta-financeira");
  }
  const validAccounts = financialAccounts.filter((item) => item.id);
  for (const account of validAccounts) {
    await db
      .insert(financialAccountsCache)
      .values({
        id: account.id!,
        name: account.nome ?? "Conta",
        bank: account.banco ?? null,
        type: account.tipo ?? null,
        active: account.ativo ?? true,
        isDefault: account.conta_padrao ?? account.padrao ?? false,
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: financialAccountsCache.id,
        set: {
          name: account.nome ?? "Conta",
          bank: account.banco ?? null,
          type: account.tipo ?? null,
          active: account.ativo ?? true,
          isDefault: account.conta_padrao ?? account.padrao ?? false,
          syncedAt: now,
        },
      });
  }

  let costCenters: RawCostCenter[] = [];
  try {
    costCenters = await fetchAllPages<RawCostCenter>("/v1/financeiro/centros-de-custo");
  } catch {
    warnings.push("Não foi possível listar centros de custo.");
  }
  const validCostCenters = costCenters.filter((item) => item.id);
  for (const center of validCostCenters) {
    await db
      .insert(costCentersCache)
      .values({
        id: center.id!,
        name: center.nome ?? "Centro de custo",
        active: center.ativo ?? true,
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: costCentersCache.id,
        set: {
          name: center.nome ?? "Centro de custo",
          active: center.ativo ?? true,
          syncedAt: now,
        },
      });
  }

  return {
    people: validPeople.length,
    categories: validCategories.length,
    financialAccounts: validAccounts.length,
    costCenters: validCostCenters.length,
    warnings,
  };
}

export async function countCatalogs() {
  const db = getDb();
  const [people, categories, accounts, centers] = await Promise.all([
    db.select({ id: peopleCache.id }).from(peopleCache),
    db.select({ id: categoriesCache.id }).from(categoriesCache),
    db.select({ id: financialAccountsCache.id }).from(financialAccountsCache),
    db.select({ id: costCentersCache.id }).from(costCentersCache),
  ]);
  return {
    people: people.length,
    categories: categories.length,
    financialAccounts: accounts.length,
    costCenters: centers.length,
  };
}

export { asArray };
