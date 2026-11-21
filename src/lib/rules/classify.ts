import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  categoriesCache,
  costCentersCache,
  financialAccountsCache,
  rules,
} from "@/db/schema";

export type Classification = {
  categoryId: string | null;
  categoryName: string | null;
  financialAccountId: string | null;
  financialAccountName: string | null;
  costCenterId: string | null;
  costCenterName: string | null;
  resolved: boolean;
  ruleId: string | null;
};

export async function classifyPayable(input: {
  supplierId: string | null;
  supplierName: string | null;
  description: string | null;
}): Promise<Classification> {
  const db = getDb();
  const activeRules = await db
    .select()
    .from(rules)
    .orderBy(asc(rules.priority));

  const description = (input.description ?? "").toLowerCase();
  const supplierName = (input.supplierName ?? "").toLowerCase();

  const matching = activeRules.filter((rule) => {
    if (!rule.active) return false;
    if (rule.scope === "supplier") return Boolean(input.supplierId && rule.supplierId === input.supplierId);
    if (rule.scope === "keyword") {
      if (!rule.keyword) return false;
      const keyword = rule.keyword.toLowerCase();
      return description.includes(keyword) || supplierName.includes(keyword);
    }
    return rule.scope === "global";
  });

  const rule = matching[0];

  let categoryId = rule?.categoryId ?? null;
  let categoryName = rule?.categoryName ?? null;
  let financialAccountId = rule?.financialAccountId ?? null;
  let financialAccountName = rule?.financialAccountName ?? null;
  let costCenterId = rule?.costCenterId ?? null;
  let costCenterName = rule?.costCenterName ?? null;

  if (!categoryId) {
    const [category] = await db.select().from(categoriesCache).limit(20);
    const expense =
      (await db.select().from(categoriesCache)).find((item) => item.type === "DESPESA") ??
      category;
    if (expense) {
      categoryId = expense.id;
      categoryName = expense.name;
    }
  }

  if (!financialAccountId) {
    const accounts = await db.select().from(financialAccountsCache);
    const account =
      accounts.find((item) => item.isDefault && item.active) ??
      accounts.find((item) => item.active) ??
      accounts[0];
    if (account) {
      financialAccountId = account.id;
      financialAccountName = account.name;
    }
  }

  if (!costCenterId) {
    const centers = await db.select().from(costCentersCache);
    const center = centers.find((item) => item.active);
    if (center && rule?.costCenterId) {
      costCenterId = center.id;
      costCenterName = center.name;
    }
  }

  return {
    categoryId,
    categoryName,
    financialAccountId,
    financialAccountName,
    costCenterId,
    costCenterName,
    resolved: Boolean(categoryId && financialAccountId),
    ruleId: rule?.id ?? null,
  };
}
