import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { payables } from "@/db/schema";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { errorMessage, fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { checkPayablePriorCharge, priorCheckNote } from "@/lib/rules/dedupe";
import { getSettings } from "@/lib/settings";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { confirmed?: unknown };
    const confirmed = body.confirmed === true;

    const [payable] = await getDb()
      .select()
      .from(payables)
      .where(eq(payables.id, id))
      .limit(1);
    if (!payable) return fail("Lançamento não encontrado.", 404);
    if (payable.status === "POSTED") return ok({ alreadyPosted: true });

    // A cobrança já existe? A tela pergunta antes de lançar de novo.
    if (!confirmed) {
      const warning = priorCheckNote(
        await checkPayablePriorCharge(payable, await getSettings()),
      );
      if (warning) {
        return NextResponse.json(
          { ok: false, error: warning, needsConfirmation: true },
          { status: 409 },
        );
      }
    }

    await getDb()
      .update(payables)
      .set({ status: "APPROVED", error: null, updatedAt: new Date() })
      .where(eq(payables.id, id));

    await enqueue(
      QUEUE_NAMES.postPayable,
      { payableId: id, actor: "admin", confirmed },
      { attempts: 1 },
    );
    await logAudit("payable_approved", {
      entity: "payable",
      entityId: id,
      actor: "admin",
      payload: { confirmed },
    });
    return ok({ queued: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
