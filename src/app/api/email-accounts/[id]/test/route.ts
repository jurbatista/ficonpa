import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailAccounts } from "@/db/schema";
import { testImapConnection } from "@/lib/mail/imap";
import { errorMessage, fail, ok } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [account] = await getDb()
      .select()
      .from(emailAccounts)
      .where(eq(emailAccounts.id, id))
      .limit(1);
    if (!account) return fail("Conta não encontrada.", 404);
    await testImapConnection(account);
    await getDb().update(emailAccounts).set({ lastError: null }).where(eq(emailAccounts.id, id));
    return ok({ connected: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
