import { getDb } from "@/lib/db";
import { emailAccounts } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { testImapConnection } from "@/lib/mail/imap";
import { errorMessage, fail, ok, readJson } from "@/lib/api";
import { listEmailAccounts } from "@/lib/queries";
import { logAudit } from "@/lib/audit";

type Body = {
  label?: string;
  email?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  folder?: string;
  lookbackDays?: number;
};

export async function GET() {
  const rows = await listEmailAccounts();
  return ok(
    rows.map(({ passwordEnc: _passwordEnc, ...rest }) => rest),
  );
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Body>(request);
    const missing = ["label", "email", "host", "username", "password"].filter(
      (field) => !body[field as keyof Body],
    );
    if (missing.length) return fail(`Campos obrigatórios: ${missing.join(", ")}.`);

    const account = {
      host: body.host!,
      port: Number(body.port ?? 993),
      secure: body.secure ?? true,
      username: body.username!,
      passwordEnc: encryptSecret(body.password!),
    };

    await testImapConnection(account);

    const [created] = await getDb()
      .insert(emailAccounts)
      .values({
        label: body.label!,
        email: body.email!,
        host: account.host,
        port: account.port,
        secure: account.secure,
        username: account.username,
        passwordEnc: account.passwordEnc,
        folder: body.folder || "INBOX",
        lookbackDays: Number(body.lookbackDays ?? 30),
      })
      .returning({ id: emailAccounts.id });

    await logAudit("email_account_created", {
      entity: "email_account",
      entityId: created.id,
      payload: { email: body.email },
    });

    return ok({ id: created.id }, { status: 201 });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
