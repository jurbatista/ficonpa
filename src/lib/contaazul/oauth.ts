import { env, optionalEnv } from "@/lib/env";

export const CONTA_AZUL_API = "https://api-v2.contaazul.com";
export const OAUTH_STATE_COOKIE = "ficonpa_oauth_state";
const AUTHORIZE_URL = "https://login.contaazul.com/#/oauth/authorize";
const SCOPE = "openid profile aws.cognito.signin.user.admin";

export function isContaAzulConfigured(): boolean {
  return Boolean(optionalEnv("CONTA_AZUL_CLIENT_ID") && optionalEnv("CONTA_AZUL_CLIENT_SECRET"));
}

function basicAuth(): string {
  const clientId = env("CONTA_AZUL_CLIENT_ID");
  const clientSecret = env("CONTA_AZUL_CLIENT_SECRET");
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env("CONTA_AZUL_CLIENT_ID"),
    redirect_uri: env("CONTA_AZUL_REDIRECT_URI"),
    state,
    scope: SCOPE,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env("CONTA_AZUL_REDIRECT_URI"),
  });
  const response = await fetch(`${CONTA_AZUL_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Falha ao trocar código Conta Azul (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(`${CONTA_AZUL_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `Falha ao renovar token Conta Azul (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as TokenResponse;
}
