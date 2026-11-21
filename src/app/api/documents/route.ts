import { listAttentionDocuments } from "@/lib/queries";
import { ok } from "@/lib/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const rows = await listAttentionDocuments(limit);
  return ok(rows);
}
