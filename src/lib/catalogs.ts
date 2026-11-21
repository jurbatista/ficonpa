import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  categoriesCache,
  costCentersCache,
  financialAccountsCache,
  peopleCache,
} from "@/db/schema";

export type CatalogItem = { id: string; name: string; detail?: string | null };

export type Catalogs = {
  people: CatalogItem[];
  categories: CatalogItem[];
  financialAccounts: CatalogItem[];
  costCenters: CatalogItem[];
};

export async function getCatalogs(): Promise<Catalogs> {
  const db = getDb();
  const [people, categories, accounts, centers] = await Promise.all([
    db.select().from(peopleCache).orderBy(asc(peopleCache.name)),
    db.select().from(categoriesCache).orderBy(asc(categoriesCache.name)),
    db.select().from(financialAccountsCache).orderBy(asc(financialAccountsCache.name)),
    db.select().from(costCentersCache).orderBy(asc(costCentersCache.name)),
  ]);

  return {
    people: people.map((item) => ({
      id: item.id,
      name: item.name,
      detail: item.document,
    })),
    categories: categories.map((item) => ({
      id: item.id,
      name: item.name,
      detail: item.type,
    })),
    financialAccounts: accounts.map((item) => ({
      id: item.id,
      name: item.name,
      detail: item.isDefault ? "padrão" : item.bank,
    })),
    costCenters: centers.map((item) => ({
      id: item.id,
      name: item.name,
      detail: null,
    })),
  };
}
