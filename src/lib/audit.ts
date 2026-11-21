import { getDb } from "@/lib/db";
import { auditLog } from "@/db/schema";

export async function logAudit(
  action: string,
  options: {
    entity?: string;
    entityId?: string;
    payload?: unknown;
    actor?: string;
  } = {},
): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({
        action,
        entity: options.entity,
        entityId: options.entityId,
        payload: options.payload ?? null,
        actor: options.actor ?? "admin",
      });
  } catch {
    // Auditoria nunca deve derrubar o fluxo principal.
  }
}
