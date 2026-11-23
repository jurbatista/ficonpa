import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { linkRecipes } from "@/db/schema";
import { errorMessage, fail, ok, readJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = schema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) return fail("Dados inválidos.", 422);
    const [row] = await getDb()
      .update(linkRecipes)
      .set({ active: parsed.data.active, updatedAt: new Date() })
      .where(eq(linkRecipes.id, id))
      .returning({ id: linkRecipes.id });
    if (!row) return fail("Caminho não encontrado.", 404);
    await logAudit("link_recipe_updated", { entity: "link_recipe", entityId: id, payload: parsed.data });
    return ok(row);
  } catch (error) {
    return fail(errorMessage(error));
  }
}

/** Esquece o caminho: o próximo link desse padrão será reaprendido. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await getDb().delete(linkRecipes).where(eq(linkRecipes.id, id));
    await logAudit("link_recipe_deleted", { entity: "link_recipe", entityId: id });
    return ok({ deleted: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
