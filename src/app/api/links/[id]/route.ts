import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailLinks } from "@/db/schema";
import { errorMessage, fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

/** Tira um link da lista (não era boleto, ou já foi resolvido por fora). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [link] = await getDb()
      .delete(emailLinks)
      .where(eq(emailLinks.id, id))
      .returning({ id: emailLinks.id });
    if (!link) return fail("Link não encontrado.", 404);
    await logAudit("link_ignored", { entity: "email_link", entityId: id, actor: "admin" });
    return ok({ removed: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
