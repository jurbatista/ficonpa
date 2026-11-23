import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailAccounts } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { ImapError, testImapConnection } from "@/lib/mail/imap";
import { discoverMailProvider, isValidEmail } from "@/lib/mail/providers";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { errorMessage, fail, ok, readJson } from "@/lib/api";
import { listEmailAccounts } from "@/lib/queries";
import { logAudit } from "@/lib/audit";

type Body = {
  email?: string;
  password?: string;
  // Opcionais (modo avançado): se ausentes, são descobertos pelo e-mail.
  label?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  folder?: string;
  lookbackDays?: number;
};

export async function GET() {
  const rows = await listEmailAccounts();
  return ok(
    rows.map((row) => ({
      ...row,
      passwordEnc: undefined,
      oauthAccessEnc: undefined,
      oauthRefreshEnc: undefined,
    })),
  );
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Body>(request);
    const email = (body.email ?? "").trim().toLowerCase();
    const password = (body.password ?? "").replace(/\s+$/g, "");
    if (!isValidEmail(email)) return fail("Informe um e-mail válido.");
    if (!password) return fail("Informe a senha.");

    const [existing] = await getDb()
      .select({ id: emailAccounts.id })
      .from(emailAccounts)
      .where(eq(emailAccounts.email, email))
      .limit(1);
    if (existing) return fail("Esta caixa já está conectada.");

    const discovery = await discoverMailProvider(email);
    const manualHost = body.host?.trim();
    const hosts = manualHost ? [manualHost] : [discovery.provider.host, ...discovery.alternatives];
    const port = Number(body.port ?? discovery.provider.port);
    const secure = body.secure ?? (port === 993 ? true : port === 143 ? false : discovery.provider.secure);
    const username = body.username?.trim() || email;
    // Senhas de app do Google são mostradas em blocos ("abcd efgh ijkl mnop").
    const cleanPassword = discovery.provider.id === "gmail" ? password.replace(/\s/g, "") : password;
    const passwordEnc = encryptSecret(cleanPassword);

    // Tenta os servidores candidatos em ordem; só passa ao próximo se o problema for o servidor.
    let host = hosts[0];
    let failure: unknown = null;
    for (const candidate of hosts) {
      try {
        await testImapConnection({ host: candidate, port, secure, username, passwordEnc });
        host = candidate;
        failure = null;
        break;
      } catch (error) {
        failure = error;
        if (!(error instanceof ImapError) || error.kind !== "host") break;
      }
    }
    if (failure) {
      return NextResponse.json(
        {
          ok: false,
          error: errorMessage(failure) || "Não foi possível conectar.",
          hostProblem: failure instanceof ImapError && failure.kind === "host",
        },
        { status: 400 },
      );
    }

    const [created] = await getDb()
      .insert(emailAccounts)
      .values({
        label: body.label?.trim() || email,
        email,
        host,
        port,
        secure,
        username,
        passwordEnc,
        authType: "password",
        provider: discovery.provider.id,
        folder: body.folder?.trim() || "INBOX",
        lookbackDays: Number(body.lookbackDays ?? 30),
      })
      .returning({ id: emailAccounts.id });

    await logAudit("email_account_created", {
      entity: "email_account",
      entityId: created.id,
      payload: { email, provider: discovery.provider.id },
    });
    // Já começa a buscar os boletos, sem precisar clicar em nada.
    await enqueue(QUEUE_NAMES.mailSync, { accountId: created.id }).catch(() => undefined);

    return ok({ id: created.id, provider: discovery.provider.name }, { status: 201 });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
