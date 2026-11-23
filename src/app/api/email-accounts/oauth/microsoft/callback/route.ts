import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailAccounts } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { emailFromIdToken, exchangeMicrosoftCode, MS_STATE_COOKIE } from "@/lib/mail/microsoft";
import { testImapConnection } from "@/lib/mail/imap";
import { PROVIDERS } from "@/lib/mail/providers";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import { appUrl } from "@/lib/env";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get(MS_STATE_COOKIE)?.value;

  const finish = (key: "ok" | "erro", message: string) => {
    const target = new URL("/conexoes/emails", appUrl());
    target.searchParams.set(key, message.slice(0, 400));
    const response = NextResponse.redirect(target);
    response.cookies.delete(MS_STATE_COOKIE);
    return response;
  };

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const description = (url.searchParams.get("error_description") ?? oauthError).split("\r\n")[0];
    return finish("erro", oauthError === "access_denied" ? "Autorização cancelada." : description);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== expected) {
    return finish("erro", "Sessão de login da Microsoft expirada. Tente novamente.");
  }

  try {
    const tokens = await exchangeMicrosoftCode(code);
    const email = emailFromIdToken(tokens.id_token);
    if (!email) return finish("erro", "A Microsoft não informou o e-mail da conta.");
    if (!tokens.refresh_token) return finish("erro", "A Microsoft não liberou acesso contínuo (refresh token).");

    const provider = PROVIDERS.microsoft;
    const values = {
      host: provider.host,
      port: provider.port,
      secure: provider.secure,
      username: email,
      passwordEnc: encryptSecret(""),
      authType: "microsoft",
      provider: provider.id,
      oauthAccessEnc: encryptSecret(tokens.access_token),
      oauthRefreshEnc: encryptSecret(tokens.refresh_token),
      oauthExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    };

    await testImapConnection(values);

    const db = getDb();
    const [existing] = await db.select({ id: emailAccounts.id }).from(emailAccounts).where(eq(emailAccounts.email, email)).limit(1);
    let id: string;
    if (existing) {
      await db.update(emailAccounts).set({ ...values, lastError: null, active: true }).where(eq(emailAccounts.id, existing.id));
      id = existing.id;
    } else {
      const [created] = await db
        .insert(emailAccounts)
        .values({ ...values, label: email, email })
        .returning({ id: emailAccounts.id });
      id = created.id;
    }
    await logAudit("email_account_created", { entity: "email_account", entityId: id, payload: { email, provider: "microsoft" } });
    await enqueue(QUEUE_NAMES.mailSync, { accountId: id }).catch(() => undefined);
    return finish("ok", `${email} conectada.`);
  } catch (error) {
    return finish("erro", error instanceof Error ? error.message : String(error));
  }
}
