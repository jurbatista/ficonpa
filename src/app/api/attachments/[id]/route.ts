import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attachments } from "@/db/schema";
import { fail } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [attachment] = await getDb()
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);
  if (!attachment) return fail("Anexo não encontrado.", 404);

  try {
    const buffer = await readFile(attachment.path);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return fail("Arquivo do anexo não está mais disponível.", 410);
  }
}
