import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { ok } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await enqueue(QUEUE_NAMES.mailSync, { accountId: id });
  return ok({ queued: true });
}
