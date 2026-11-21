import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailAccounts } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { errorMessage, fail, ok, readJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Body = {
  label?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  folder?: string;
  lookbackDays?: number;
  active?: boolean;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await readJson<Body>(request);
    const values: Record<string, unknown> = {};
    if (body.label) values.label = body.label;
    if (body.host) values.host = body.host;
    if (body.port) values.port = Number(body.port);
    if (body.secure !== undefined) values.secure = body.secure;
    if (body.username) values.username = body.username;
    if (body.password) values.passwordEnc = encryptSecret(body.password);
    if (body.folder) values.folder = body.folder;
    if (body.lookbackDays) values.lookbackDays = Number(body.lookbackDays);
    if (body.active !== undefined) values.active = body.active;

    if (Object.keys(values).length === 0) return fail("Nada para atualizar.");

    await getDb().update(emailAccounts).set(values).where(eq(emailAccounts.id, id));
    await logAudit("email_account_updated", {
      entity: "email_account",
      entityId: id,
      payload: { fields: Object.keys(values) },
    });
    return ok({ id });
  } catch (error) {
    return fail(errorMessage(error));
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await getDb().delete(emailAccounts).where(eq(emailAccounts.id, id));
    await logAudit("email_account_deleted", { entity: "email_account", entityId: id });
    return ok({ id });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
