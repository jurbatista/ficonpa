import { ImapFlow } from "imapflow";
import type { EmailAccount } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { microsoftAccessToken } from "./microsoft";

export type ImapAccountInput = Pick<
  EmailAccount,
  "host" | "port" | "secure" | "username" | "passwordEnc"
> &
  Partial<Pick<EmailAccount, "id" | "authType" | "oauthAccessEnc" | "oauthRefreshEnc" | "oauthExpiresAt">>;

export async function createImapClient(account: ImapAccountInput): Promise<ImapFlow> {
  const auth =
    account.authType === "microsoft"
      ? {
          user: account.username,
          accessToken: await microsoftAccessToken({
            id: account.id,
            oauthAccessEnc: account.oauthAccessEnc ?? null,
            oauthRefreshEnc: account.oauthRefreshEnc ?? null,
            oauthExpiresAt: account.oauthExpiresAt ?? null,
          }),
        }
      : { user: account.username, pass: decryptSecret(account.passwordEnc) };

  return new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth,
    logger: false,
    emitLogs: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
  });
}

type ImapErrorLike = Error & {
  code?: string;
  responseText?: string;
  responseStatus?: string;
  authenticationFailed?: boolean;
  serverResponseCode?: string;
};

/** "auth" = a senha foi recusada; "host" = o servidor informado está errado ou inalcançável. */
export type ImapProblem = "auth" | "host" | "other";

export class ImapError extends Error {
  kind: ImapProblem;
  constructor(message: string, kind: ImapProblem) {
    super(message);
    this.kind = kind;
  }
}

/**
 * O imapflow devolve "Command failed" para quase tudo; o motivo real fica em
 * responseText/serverResponseCode. Traduz para uma frase curta que diga o que fazer.
 */
export function describeImapError(
  error: unknown,
  host?: string,
): { message: string; kind: ImapProblem; raw: string } {
  if (!(error instanceof Error)) return { message: String(error), kind: "other", raw: String(error) };
  const err = error as ImapErrorLike;
  const raw = [err.message, err.serverResponseCode, err.responseText, err.code]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
  const isMicrosoft = /outlook|office365|hotmail|live\.com/i.test(host ?? "");
  const isGoogle = /gmail|google/i.test(host ?? "");
  const result = (message: string, kind: ImapProblem) => ({ message, kind, raw });

  if (/login is disabled|basicauthblocked|basic auth/i.test(raw) || (isMicrosoft && /disabled/i.test(raw))) {
    return result("A Microsoft não aceita senha nesta conta. Use “Entrar com a Microsoft”.", "auth");
  }
  if (
    err.authenticationFailed ||
    /AUTHENTICATIONFAILED|invalid credentials|authentication failed|login failed|LOGIN.*(fail|invalid)|incorrect/i.test(raw)
  ) {
    return result(
      isGoogle
        ? "O Gmail recusou a senha. Use uma senha de app, não a senha normal."
        : "O servidor recusou o usuário ou a senha.",
      "auth",
    );
  }
  if (/NoConnection|Connection not available|ECONNRESET|EPIPE|socket hang up|Unexpected close/i.test(raw)) {
    return result("A conexão com o servidor de e-mail caiu. A próxima busca tenta de novo.", "other");
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) return result(`Servidor ${host} não encontrado.`, "host");
  if (/ECONNREFUSED/i.test(raw)) return result(`O servidor ${host} recusou a conexão nesta porta.`, "host");
  if (/ETIMEDOUT|timeout|timed out/i.test(raw)) return result(`O servidor ${host} não respondeu.`, "host");
  if (/certificate|self.signed|CERT_|SSL|TLS|wrong version number/i.test(raw)) {
    return result(`Erro de segurança ao conectar em ${host}. Confira a porta (o normal é 993).`, "host");
  }
  return result(raw || "Não foi possível conectar.", "other");
}

export async function testImapConnection(account: ImapAccountInput): Promise<void> {
  let client: ImapFlow | null = null;
  try {
    client = await createImapClient(account);
    client.on("error", () => undefined);
    await client.connect();
    await client.noop();
  } catch (error) {
    const problem = describeImapError(error, account.host);
    // Log sem senha, com a resposta crua do servidor, para diagnóstico.
    console.warn(
      `[imap] falha ao conectar ${account.username}@${account.host}:${account.port} (ssl=${account.secure}): ${problem.raw}`,
    );
    throw new ImapError(problem.message, problem.kind);
  } finally {
    await client?.logout().catch(() => undefined);
  }
}

type BodyNode = {
  type?: string;
  childNodes?: BodyNode[];
  dispositionParameters?: Record<string, string>;
  parameters?: Record<string, string>;
  size?: number;
};

export function hasPdfPart(node?: BodyNode | null): boolean {
  if (!node) return false;
  const filename =
    node.dispositionParameters?.filename ?? node.parameters?.name ?? "";
  if (/\.pdf$/i.test(filename)) return true;
  if ((node.type ?? "").toLowerCase().includes("pdf")) return true;
  return (node.childNodes ?? []).some((child) => hasPdfPart(child));
}
