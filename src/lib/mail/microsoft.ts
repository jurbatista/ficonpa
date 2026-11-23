import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailAccounts, type EmailAccount } from "@/db/schema";
import { getIntegrationConfig } from "@/lib/config";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

/**
 * Login da Microsoft (OAuth2) para IMAP. A Microsoft desativou o login por senha
 * em Outlook.com/Hotmail e, por padrão, no Microsoft 365: o IMAP só aceita XOAUTH2.
 * Requer um aplicativo registrado no portal Azure (Client ID + Secret em Configurações).
 */

export const MS_STATE_COOKIE = "ficonpa_ms_state";
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPE = "offline_access openid email https://outlook.office.com/IMAP.AccessAsUser.All";

export function microsoftRedirectUri(): string {
  return `${appUrl()}/api/email-accounts/oauth/microsoft/callback`;
}

async function credentials() {
  const config = await getIntegrationConfig();
  if (!config.microsoftClientId || !config.microsoftClientSecret) {
    throw new Error("Login da Microsoft não configurado. Preencha Client ID e Secret em Configurações.");
  }
  return { clientId: config.microsoftClientId, clientSecret: config.microsoftClientSecret };
}

export async function isMicrosoftConfigured(): Promise<boolean> {
  const config = await getIntegrationConfig();
  return Boolean(config.microsoftClientId && config.microsoftClientSecret);
}

export async function buildMicrosoftAuthorizeUrl(state: string, email?: string): Promise<string> {
  const { clientId } = await credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: SCOPE,
    state,
    prompt: "select_account",
  });
  if (email) params.set("login_hint", email);
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

export type MicrosoftTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
};

async function tokenRequest(fields: Record<string, string>): Promise<MicrosoftTokens> {
  const { clientId, clientSecret } = await credentials();
  const response = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: SCOPE, ...fields }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: string; error_description?: string };
      detail = `${parsed.error ?? ""}: ${(parsed.error_description ?? "").split("\r\n")[0]}`;
    } catch {
      // mantém o texto cru
    }
    throw new Error(`A Microsoft recusou a autorização (${detail}).`);
  }
  return JSON.parse(text) as MicrosoftTokens;
}

export function exchangeMicrosoftCode(code: string): Promise<MicrosoftTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: microsoftRedirectUri() });
}

/** E-mail da conta que autorizou (lido do id_token; só para preencher o cadastro). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as {
      email?: string;
      preferred_username?: string;
    };
    const value = payload.email ?? payload.preferred_username ?? null;
    return value && value.includes("@") ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

type OAuthFields = Pick<EmailAccount, "oauthAccessEnc" | "oauthRefreshEnc" | "oauthExpiresAt"> & { id?: string };

/** Access token válido para o IMAP, renovando (e gravando) quando falta menos de 5 min. */
export async function microsoftAccessToken(account: OAuthFields): Promise<string> {
  const fresh = account.oauthExpiresAt && account.oauthExpiresAt.getTime() - Date.now() > 5 * 60_000;
  if (fresh && account.oauthAccessEnc) return decryptSecret(account.oauthAccessEnc);
  if (!account.oauthRefreshEnc) throw new Error("Autorização da Microsoft ausente. Conecte a caixa novamente.");

  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: decryptSecret(account.oauthRefreshEnc),
  });
  if (account.id) {
    await getDb()
      .update(emailAccounts)
      .set({
        oauthAccessEnc: encryptSecret(tokens.access_token),
        oauthRefreshEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : account.oauthRefreshEnc,
        oauthExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      })
      .where(eq(emailAccounts.id, account.id));
  }
  return tokens.access_token;
}
