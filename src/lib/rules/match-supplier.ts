import { getDb } from "@/lib/db";
import { peopleCache } from "@/db/schema";
import type { JevCandidate } from "@/lib/ai/jev";

export type SupplierMatch = {
  exact: { id: string; name: string; document: string | null } | null;
  candidates: JevCandidate[];
  method: "cnpj" | "name" | "none";
  confidence: number;
};

export function normalizeDocument(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|sa|s\.a|s\/a|cia|companhia)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizeName(value).split(" ").filter((token) => token.length > 2));
}

export function nameSimilarity(a: string, b: string): number {
  const setA = tokens(a);
  const setB = tokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = intersection / union;
  const containment = intersection / Math.min(setA.size, setB.size);
  return Math.max(jaccard, containment * 0.95);
}

export async function findSupplierMatch(input: {
  document: string | null;
  name: string | null;
}): Promise<SupplierMatch> {
  const people = await getDb().select().from(peopleCache);
  const document = normalizeDocument(input.document);

  if (document) {
    const exact = people.find((person) => normalizeDocument(person.document) === document);
    if (exact) {
      return {
        exact: { id: exact.id, name: exact.name, document: exact.document },
        candidates: [],
        method: "cnpj",
        confidence: 1,
      };
    }
  }

  if (!input.name) {
    return { exact: null, candidates: [], method: "none", confidence: 0 };
  }

  const ranked = people
    .map((person) => ({ person, score: nameSimilarity(input.name!, person.name) }))
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (ranked.length === 0) {
    return { exact: null, candidates: [], method: "none", confidence: 0 };
  }

  return {
    exact: null,
    candidates: ranked.map((item) => ({
      id: item.person.id,
      name: item.person.name,
      document: item.person.document,
    })),
    method: "name",
    confidence: ranked[0].score,
  };
}
