import { redirect } from "next/navigation";

/** A lista de boletos mora na página inicial; este endereço antigo só encaminha. */
export default async function LegacyListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.tab === "lancados") query.set("tab", "lancados");
  if (params.tab === "rejeitados" || params.tab === "descartados") query.set("tab", "descartados");
  if (params.q) query.set("q", params.q);
  redirect(query.size > 0 ? `/?${query.toString()}` : "/");
}
