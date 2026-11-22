import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { settings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { appUrl, optionalEnv } from "@/lib/env";

const KEYS = {
  openrouterApiKey: "openrouter_api_key",
  contaAzulClientId: "conta_azul_client_id",
  contaAzulClientSecret: "conta_azul_client_secret",
  contaAzulRedirectUri: "conta_azul_redirect_uri",
  appPasswordHash: "app_password_hash",
} as const;

async function readSetting(key: string): Promise<unknown | null> {
  try {
    const [row] = await getDb()
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  await getDb()
    .insert(settings)
    .values({ key, value: value as never, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as never, updatedAt: new Date() },
    });
}

async function clearSetting(key: string): Promise<void> {
  await getDb().delete(settings).where(eq(settings.key, key));
}

function safeDecrypt(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

function plain(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export type IntegrationConfig = {
  openrouterApiKey: string | null;
  contaAzulClientId: string | null;
  contaAzulClientSecret: string | null;
  contaAzulRedirectUri: string;
};

export async function getIntegrationConfig(): Promise<IntegrationConfig> {
  const [apiKeyRaw, clientIdRaw, clientSecretRaw, redirectRaw] = await Promise.all([
    readSetting(KEYS.openrouterApiKey),
    readSetting(KEYS.contaAzulClientId),
    readSetting(KEYS.contaAzulClientSecret),
    readSetting(KEYS.contaAzulRedirectUri),
  ]);

  return {
    openrouterApiKey: safeDecrypt(apiKeyRaw) ?? optionalEnv("OPENROUTER_API_KEY") ?? null,
    contaAzulClientId: plain(clientIdRaw) ?? optionalEnv("CONTA_AZUL_CLIENT_ID") ?? null,
    contaAzulClientSecret:
      safeDecrypt(clientSecretRaw) ?? optionalEnv("CONTA_AZUL_CLIENT_SECRET") ?? null,
    contaAzulRedirectUri:
      plain(redirectRaw) ??
      optionalEnv("CONTA_AZUL_REDIRECT_URI") ??
      `${appUrl()}/api/conta-azul/callback`,
  };
}

export type ConfigSource = "database" | "environment" | null;

export type IntegrationConfigStatus = {
  openrouterApiKey: ConfigSource;
  contaAzulClientId: ConfigSource;
  contaAzulClientSecret: ConfigSource;
  contaAzulRedirectUri: ConfigSource;
};

export async function getIntegrationConfigStatus(): Promise<IntegrationConfigStatus> {
  const [apiKeyRaw, clientIdRaw, clientSecretRaw, redirectRaw] = await Promise.all([
    readSetting(KEYS.openrouterApiKey),
    readSetting(KEYS.contaAzulClientId),
    readSetting(KEYS.contaAzulClientSecret),
    readSetting(KEYS.contaAzulRedirectUri),
  ]);

  return {
    openrouterApiKey: safeDecrypt(apiKeyRaw)
      ? "database"
      : optionalEnv("OPENROUTER_API_KEY")
        ? "environment"
        : null,
    contaAzulClientId: plain(clientIdRaw)
      ? "database"
      : optionalEnv("CONTA_AZUL_CLIENT_ID")
        ? "environment"
        : null,
    contaAzulClientSecret: safeDecrypt(clientSecretRaw)
      ? "database"
      : optionalEnv("CONTA_AZUL_CLIENT_SECRET")
        ? "environment"
        : null,
    contaAzulRedirectUri: plain(redirectRaw)
      ? "database"
      : optionalEnv("CONTA_AZUL_REDIRECT_URI")
        ? "environment"
        : null,
  };
}

/** Mascara um segredo para exibição, mantendo apenas as pontas. */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 3)}••••••${value.slice(-3)}`;
}

export type IntegrationInput = {
  openrouterApiKey?: string;
  contaAzulClientId?: string;
  contaAzulClientSecret?: string;
  contaAzulRedirectUri?: string;
};

export async function saveIntegrationConfig(
  input: IntegrationInput,
): Promise<IntegrationConfig> {
  if (input.openrouterApiKey !== undefined) {
    if (input.openrouterApiKey.trim() === "") await clearSetting(KEYS.openrouterApiKey);
    else await writeSetting(KEYS.openrouterApiKey, encryptSecret(input.openrouterApiKey.trim()));
  }
  if (input.contaAzulClientId !== undefined) {
    if (input.contaAzulClientId.trim() === "") await clearSetting(KEYS.contaAzulClientId);
    else await writeSetting(KEYS.contaAzulClientId, input.contaAzulClientId.trim());
  }
  if (input.contaAzulClientSecret !== undefined) {
    if (input.contaAzulClientSecret.trim() === "") {
      await clearSetting(KEYS.contaAzulClientSecret);
    } else {
      await writeSetting(
        KEYS.contaAzulClientSecret,
        encryptSecret(input.contaAzulClientSecret.trim()),
      );
    }
  }
  if (input.contaAzulRedirectUri !== undefined) {
    if (input.contaAzulRedirectUri.trim() === "") {
      await clearSetting(KEYS.contaAzulRedirectUri);
    } else {
      await writeSetting(KEYS.contaAzulRedirectUri, input.contaAzulRedirectUri.trim());
    }
  }
  return getIntegrationConfig();
}

export async function getOpenRouterApiKey(): Promise<string | null> {
  return (await getIntegrationConfig()).openrouterApiKey;
}

export async function getPasswordHash(): Promise<string | null> {
  const stored = plain(await readSetting(KEYS.appPasswordHash));
  return stored ?? optionalEnv("APP_PASSWORD_HASH") ?? null;
}

export async function setPasswordHash(hash: string): Promise<void> {
  await writeSetting(KEYS.appPasswordHash, hash);
}
