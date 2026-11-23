import { resolveMx } from "node:dns/promises";
import { connect as tlsConnect } from "node:tls";
import { isPublicHost } from "@/lib/links/net-guard";

/**
 * Descobre como conectar uma caixa a partir só do endereço de e-mail:
 *   1. domínio conhecido (gmail.com, outlook.com, uol.com.br…);
 *   2. domínio próprio: consulta o MX e reconhece quem hospeda (Google Workspace,
 *      Microsoft 365, Zoho, Hostinger, Locaweb…);
 *   3. último recurso: testa imap.dominio / mail.dominio na porta 993.
 */

export type AuthKind = "password" | "app-password" | "microsoft";

export type MailProvider = {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  auth: AuthKind;
  /** Rótulo do campo de senha. */
  passwordLabel: string;
  /** Passos curtos para o usuário conseguir a senha certa. */
  steps: string[];
  helpUrl?: string;
};

const P = (provider: Omit<MailProvider, "port" | "secure"> & { port?: number; secure?: boolean }): MailProvider => ({
  port: 993,
  secure: true,
  ...provider,
});

const NORMAL = "Senha do e-mail";

export const PROVIDERS: Record<string, MailProvider> = {
  gmail: P({
    id: "gmail",
    name: "Gmail / Google Workspace",
    host: "imap.gmail.com",
    auth: "app-password",
    passwordLabel: "Senha de app do Google (16 letras)",
    steps: [
      "Ative a verificação em duas etapas na conta Google.",
      "Abra “Senhas de app”, crie uma chamada “ficonpa” e copie as 16 letras.",
      "Cole aqui. A senha normal do Gmail não funciona.",
    ],
    helpUrl: "https://myaccount.google.com/apppasswords",
  }),
  microsoft: P({
    id: "microsoft",
    name: "Outlook / Hotmail / Microsoft 365",
    host: "outlook.office365.com",
    auth: "microsoft",
    passwordLabel: "Senha de app da Microsoft",
    steps: [
      "A Microsoft não aceita mais senha comum: o acesso é pelo botão “Entrar com a Microsoft”.",
    ],
    helpUrl: "https://account.live.com/proofs/AppPassword",
  }),
  yahoo: P({
    id: "yahoo",
    name: "Yahoo Mail",
    host: "imap.mail.yahoo.com",
    auth: "app-password",
    passwordLabel: "Senha de app do Yahoo",
    steps: ["Em Segurança da conta, clique em “Gerar senha de app” e cole aqui."],
    helpUrl: "https://login.yahoo.com/account/security",
  }),
  icloud: P({
    id: "icloud",
    name: "iCloud Mail",
    host: "imap.mail.me.com",
    auth: "app-password",
    passwordLabel: "Senha específica de app da Apple",
    steps: ["Em account.apple.com → Início de sessão e segurança → Senhas específicas de apps, gere uma e cole aqui."],
    helpUrl: "https://account.apple.com/account/manage",
  }),
  aol: P({
    id: "aol",
    name: "AOL Mail",
    host: "imap.aol.com",
    auth: "app-password",
    passwordLabel: "Senha de app da AOL",
    steps: ["Em Segurança da conta, gere uma senha de app e cole aqui."],
    helpUrl: "https://login.aol.com/account/security",
  }),
  zoho: P({
    id: "zoho",
    name: "Zoho Mail",
    host: "imap.zoho.com",
    auth: "app-password",
    passwordLabel: "Senha do Zoho (ou senha de app)",
    steps: [
      "Ative o acesso IMAP em Configurações → Contas de e-mail → IMAP.",
      "Com verificação em duas etapas, gere uma senha específica de aplicativo.",
    ],
    helpUrl: "https://accounts.zoho.com/home#security/app_password",
  }),
  uol: P({ id: "uol", name: "UOL Mail", host: "imap.uol.com.br", auth: "password", passwordLabel: NORMAL, steps: [] }),
  bol: P({ id: "bol", name: "BOL Mail", host: "imap.bol.com.br", auth: "password", passwordLabel: NORMAL, steps: [] }),
  terra: P({ id: "terra", name: "Terra Mail", host: "imap.terra.com.br", auth: "password", passwordLabel: NORMAL, steps: [] }),
  ig: P({ id: "ig", name: "iG Mail", host: "imap.ig.com.br", auth: "password", passwordLabel: NORMAL, steps: [] }),
  hostinger: P({ id: "hostinger", name: "Hostinger", host: "imap.hostinger.com", auth: "password", passwordLabel: NORMAL, steps: [] }),
  titan: P({ id: "titan", name: "Titan Mail", host: "imap.titan.email", auth: "password", passwordLabel: NORMAL, steps: [] }),
  locaweb: P({ id: "locaweb", name: "Locaweb", host: "email-ssl.com.br", auth: "password", passwordLabel: NORMAL, steps: [] }),
  kinghost: P({ id: "kinghost", name: "KingHost", host: "imap.kinghost.net", auth: "password", passwordLabel: NORMAL, steps: [] }),
  umbler: P({ id: "umbler", name: "Umbler", host: "imap.umbler.com", auth: "password", passwordLabel: NORMAL, steps: [] }),
  godaddy: P({ id: "godaddy", name: "GoDaddy", host: "imap.secureserver.net", auth: "password", passwordLabel: NORMAL, steps: [] }),
  skymail: P({ id: "skymail", name: "Skymail", host: "imap.skymail.net.br", auth: "password", passwordLabel: NORMAL, steps: [] }),
  yandex: P({
    id: "yandex",
    name: "Yandex Mail",
    host: "imap.yandex.com",
    auth: "app-password",
    passwordLabel: "Senha de app do Yandex",
    steps: ["Ative o IMAP nas configurações e gere uma senha de app."],
  }),
  gmx: P({ id: "gmx", name: "GMX", host: "imap.gmx.com", auth: "password", passwordLabel: NORMAL, steps: ["Ative o acesso IMAP nas configurações do GMX."] }),
  fastmail: P({
    id: "fastmail",
    name: "Fastmail",
    host: "imap.fastmail.com",
    auth: "app-password",
    passwordLabel: "Senha de app do Fastmail",
    steps: ["Em Configurações → Privacidade e segurança → Senhas de app, crie uma com acesso IMAP."],
  }),
};

/** Domínio do e-mail → provedor. */
const DOMAINS: Record<string, string> = {
  "gmail.com": "gmail",
  "googlemail.com": "gmail",
  "outlook.com": "microsoft",
  "outlook.com.br": "microsoft",
  "hotmail.com": "microsoft",
  "hotmail.com.br": "microsoft",
  "live.com": "microsoft",
  "live.com.br": "microsoft",
  "msn.com": "microsoft",
  "yahoo.com": "yahoo",
  "yahoo.com.br": "yahoo",
  "ymail.com": "yahoo",
  "rocketmail.com": "yahoo",
  "icloud.com": "icloud",
  "me.com": "icloud",
  "mac.com": "icloud",
  "aol.com": "aol",
  "zoho.com": "zoho",
  "zohomail.com": "zoho",
  "uol.com.br": "uol",
  "bol.com.br": "bol",
  "terra.com.br": "terra",
  "ig.com.br": "ig",
  "yandex.com": "yandex",
  "gmx.com": "gmx",
  "fastmail.com": "fastmail",
};

/** Trecho do servidor MX → provedor (domínios próprios). */
const MX_PATTERNS: Array<[RegExp, string]> = [
  [/(^|\.)google\.com$|googlemail\.com$/, "gmail"],
  [/outlook\.com$|office365\.|microsoft\.com$/, "microsoft"],
  [/zoho\.(com|eu|in)$|zohomail/, "zoho"],
  [/hostinger\./, "hostinger"],
  [/titan\.email$/, "titan"],
  [/locaweb\.com\.br$|email-ssl\.com\.br$/, "locaweb"],
  [/kinghost\.net$/, "kinghost"],
  [/umbler\.com$/, "umbler"],
  [/secureserver\.net$/, "godaddy"],
  [/skymail\.net\.br$/, "skymail"],
  [/uhserver\.com$|uol\.com\.br$/, "uol"],
  [/yahoodns\.net$/, "yahoo"],
  [/icloud\.com$/, "icloud"],
  [/yandex\.(net|ru|com)$/, "yandex"],
  [/messagingengine\.com$/, "fastmail"],
  [/terra\.com(\.br)?$/, "terra"],
];

export type Discovery = {
  email: string;
  domain: string;
  /** Como chegamos à resposta. */
  via: "domain" | "mx" | "probe" | "unknown";
  provider: MailProvider;
  /** Servidores alternativos a tentar se o principal não responder. */
  alternatives: string[];
};

function canConnectImaps(host: string, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = tlsConnect({ host, port: 993, servername: host, timeout: timeoutMs });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    // Um servidor IMAP sempre se apresenta com "* OK".
    socket.once("data", (chunk) => done(chunk.toString("latin1").startsWith("* ")));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function generic(host: string, domain: string): MailProvider {
  return P({
    id: "custom",
    name: `E-mail de ${domain}`,
    host,
    auth: "password",
    passwordLabel: NORMAL,
    steps: [],
  });
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export async function discoverMailProvider(rawEmail: string): Promise<Discovery> {
  const email = rawEmail.trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");
  const domain = email.split("@")[1];

  const known = DOMAINS[domain];
  if (known) return { email, domain, via: "domain", provider: PROVIDERS[known], alternatives: [] };

  let mxHosts: string[] = [];
  try {
    const records = await resolveMx(domain);
    mxHosts = records.sort((a, b) => a.priority - b.priority).map((item) => item.exchange.toLowerCase().replace(/\.$/, ""));
  } catch {
    mxHosts = [];
  }
  for (const mx of mxHosts) {
    const match = MX_PATTERNS.find(([pattern]) => pattern.test(mx));
    if (match) return { email, domain, via: "mx", provider: PROVIDERS[match[1]], alternatives: [] };
  }

  // Hospedagem própria (cPanel, Plesk…): tenta os nomes mais comuns.
  const mxBase = mxHosts[0]?.split(".").slice(-3).join(".");
  const guesses = [...new Set([`imap.${domain}`, `mail.${domain}`, ...(mxHosts[0] ? [mxHosts[0]] : []), ...(mxBase ? [`imap.${mxBase}`, `mail.${mxBase}`] : [])])];
  const reachable: string[] = [];
  await Promise.all(
    guesses.map(async (host) => {
      if ((await isPublicHost(host)) && (await canConnectImaps(host))) reachable.push(host);
    }),
  );
  const ordered = guesses.filter((host) => reachable.includes(host));
  if (ordered.length > 0) {
    return { email, domain, via: "probe", provider: generic(ordered[0], domain), alternatives: ordered.slice(1) };
  }
  return { email, domain, via: "unknown", provider: generic(`imap.${domain}`, domain), alternatives: [`mail.${domain}`] };
}
