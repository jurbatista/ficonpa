import { getIntegrationConfig } from "@/lib/config";

export const CONTA_AZUL_API = "https://api-v2.contaazul.com";
export const OAUTH_STATE_COOKIE = "ficonpa_oauth_state";
const AUTHORIZE_URL = "https://login.contaazul.com/#/oauth/authorize";
const SCOPE = "openid profile aws.cognito.signin.user.admin";

export async function isContaAzulConfigured(): Promise<boolean> {
  const config = await getIntegrationConfig();
  return Boolean(config.contaAzulClientId && config.contaAzulClientSecret);
}

async function credentials(): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}> {
  const config = await getIntegrationConfig();
  if (!config.contaAzulClientId || !config.contaAzulClientSecret) {
    throw new Error(
      "Conta Azul não configurado. Preencha Client ID e Client Secret em Configurações.",
    );
  }
  return {
    clientId: config.contaAzulClientId,
    clientSecret: config.contaAzulClientSecret,
    redirectUri: config.contaAzulRedirectUri,
  };
}

function basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function buildAuthorizeUrl(state: string): Promise<string> {
  const { clientId, redirectUri } = await credentials();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
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
  const { clientId, clientSecret, redirectUri } = await credentials();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const response = await fetch(`${CONTA_AZUL_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
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
  const { clientId, clientSecret } = await credentials();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(`${CONTA_AZUL_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
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
