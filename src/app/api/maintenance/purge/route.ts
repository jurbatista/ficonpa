import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST() {
  await enqueue(QUEUE_NAMES.purge, {});
  await logAudit("retention_purge_requested", { actor: "admin" });
  return ok({ queued: true });
}
