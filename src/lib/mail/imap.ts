import { ImapFlow } from "imapflow";
import type { EmailAccount } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";

export type ImapAccountInput = Pick<
  EmailAccount,
  "host" | "port" | "secure" | "username" | "passwordEnc"
>;

export function createImapClient(account: ImapAccountInput): ImapFlow {
  return new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: {
      user: account.username,
      pass: decryptSecret(account.passwordEnc),
    },
    logger: false,
    emitLogs: false,
  });
}

export async function testImapConnection(account: ImapAccountInput): Promise<void> {
  const client = createImapClient(account);
  await client.connect();
  try {
    await client.noop();
  } finally {
    await client.logout().catch(() => undefined);
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
