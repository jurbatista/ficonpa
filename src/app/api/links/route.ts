import { z } from "zod";
import { getDb } from "@/lib/db";
import { emailLinks } from "@/db/schema";
import { enqueue, LINK_JOB_OPTIONS, QUEUE_NAMES } from "@/lib/queue";
import { listEmailLinks, listLinkRecipes } from "@/lib/links/queries";
import { errorMessage, fail, ok, readJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const [recipes, links] = await Promise.all([listLinkRecipes(), listEmailLinks()]);
  return ok({ recipes, links });
}

const schema = z.object({ url: z.string().url().startsWith("https://") });

/** Teste manual: aprende/valida o caminho de um link colado na tela (não gera conta a pagar). */
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) return fail("Informe um link https válido.", 422);
    const url = parsed.data.url.trim();
    const [link] = await getDb()
      .insert(emailLinks)
      .values({ url, host: new URL(url).hostname })
      .returning({ id: emailLinks.id });
    await enqueue(QUEUE_NAMES.resolveLink, { linkId: link.id }, { ...LINK_JOB_OPTIONS, attempts: 1 });
    await logAudit("link_test_requested", { entity: "email_link", entityId: link.id, payload: { host: new URL(url).hostname } });
    return ok({ id: link.id, queued: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
