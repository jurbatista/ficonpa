import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contaAzulConnection } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshAccessToken, type TokenResponse } from "./oauth";

export type StoredConnection = typeof contaAzulConnection.$inferSelect;

export async function getConnection(): Promise<StoredConnection | null> {
  const [row] = await getDb()
    .select()
    .from(contaAzulConnection)
    .orderBy(desc(contaAzulConnection.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function saveConnection(
  tokens: TokenResponse,
  companyName?: string,
): Promise<StoredConnection> {
  const db = getDb();
  const existing = await getConnection();
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
  const values = {
    accessTokenEnc: encryptSecret(tokens.access_token),
    refreshTokenEnc: encryptSecret(tokens.refresh_token),
    expiresAt,
    scope: tokens.token_type,
    companyName: companyName ?? existing?.companyName ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(contaAzulConnection)
      .set(values)
      .where(eq(contaAzulConnection.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(contaAzulConnection).values(values).returning();
  return created;
}

export async function deleteConnection(): Promise<void> {
  await getDb().delete(contaAzulConnection);
}

async function refresh(connection: StoredConnection): Promise<StoredConnection> {
  const refreshToken = decryptSecret(connection.refreshTokenEnc);
  const tokens = await refreshAccessToken(refreshToken);
  return saveConnection(tokens, connection.companyName ?? undefined);
}

/** Retorna um access token válido, renovando se faltar menos de 5 minutos. */
export async function getValidAccessToken(): Promise<string> {
  let connection = await getConnection();
  if (!connection) throw new Error("Conta Azul não conectada.");

  if (connection.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    connection = await refresh(connection);
  }
  return decryptSecret(connection.accessTokenEnc);
}

export async function forceRefresh(): Promise<string> {
  const connection = await getConnection();
  if (!connection) throw new Error("Conta Azul não conectada.");
  const refreshed = await refresh(connection);
  return decryptSecret(refreshed.accessTokenEnc);
}
