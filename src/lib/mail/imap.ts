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
    socketTimeout: 60_000,
  });
}

type ImapErrorLike = Error & {
  code?: string;
  responseText?: string;
  responseStatus?: string;
  authenticationFailed?: boolean;
  serverResponseCode?: string;
};

/**
 * O imapflow devolve "Command failed" para quase tudo; o motivo real fica em
 * responseText/serverResponseCode. Traduz para uma mensagem que diga o que fazer.
 */
export function describeImapError(error: unknown, host?: string): string {
  if (!(error instanceof Error)) return String(error);
  const err = error as ImapErrorLike;
  const server = [err.serverResponseCode, err.responseText].filter(Boolean).join(" ").trim();
  const detail = server ? ` (servidor: ${server.slice(0, 200)})` : "";
  const text = `${err.message} ${server} ${err.code ?? ""}`;
  const isMicrosoft = /outlook|office365|hotmail|live\.com/i.test(host ?? "");
  const isGoogle = /gmail|google/i.test(host ?? "");

  if (/login is disabled|basicauthblocked|basic auth/i.test(text) || (isMicrosoft && /disabled/i.test(text))) {
    return `A Microsoft não aceita login por senha nesta conta${detail}. Use o botão “Entrar com a Microsoft”.`;
  }
  if (err.authenticationFailed || /AUTHENTICATIONFAILED|invalid credentials|authentication failed|login failed|LOGIN.*(fail|invalid)|incorrect/i.test(text)) {
    if (isGoogle) {
      return `O Gmail recusou usuário/senha${detail}. Use uma senha de app (myaccount.google.com/apppasswords, exige verificação em 2 etapas), o e-mail completo como usuário, e confirme que o IMAP está ativo nas configurações do Gmail.`;
    }
    return `Usuário ou senha recusados pelo servidor${detail}. Confira o usuário (geralmente o e-mail completo) e a senha; se o provedor exigir, use uma senha de aplicativo.`;
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(text)) return `Servidor IMAP "${host}" não encontrado. Confira o endereço (ex.: imap.gmail.com, imap.hostinger.com).`;
  if (/ECONNREFUSED/i.test(text)) return `O servidor ${host} recusou a conexão nessa porta. Use 993 com SSL ativado (ou 143 sem SSL).`;
  if (/ETIMEDOUT|timeout|timed out/i.test(text)) return `Tempo esgotado ao conectar em ${host}. Verifique host e porta (993 com SSL).`;
  if (/certificate|self.signed|CERT_|SSL|TLS|wrong version number/i.test(text)) {
    return `Erro de SSL/TLS com ${host}${detail}. Se usar a porta 993, mantenha SSL ativado; na porta 143, desative.`;
  }
  return `${err.message}${detail}`;
}

export async function testImapConnection(account: ImapAccountInput): Promise<void> {
  let client: ImapFlow | null = null;
  try {
    client = await createImapClient(account);
    client.on("error", () => undefined);
    await client.connect();
    await client.noop();
  } catch (error) {
    const message = describeImapError(error, account.host);
    // Log sem senha, para diagnóstico pelos logs do servidor.
    console.warn(
      `[imap] falha ao conectar ${account.username}@${account.host}:${account.port} (ssl=${account.secure}): ${message}`,
    );
    throw new Error(message);
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
