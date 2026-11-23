import { EmailAccountsManager, type EmailAccountView } from "@/components/app/email-accounts-manager";
import { PageHeader } from "@/components/app/ui";
import { listEmailAccounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EmailAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const [rows, params] = await Promise.all([listEmailAccounts(), searchParams]);

  const accounts: EmailAccountView[] = rows.map((row) => ({
    id: row.id,
    label: row.label,
    email: row.email,
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    folder: row.folder,
    lookbackDays: row.lookbackDays,
    active: row.active,
    provider: row.provider,
    authType: row.authType,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  }));

  const notice = params.ok
    ? { type: "ok" as const, message: params.ok }
    : params.erro
      ? { type: "erro" as const, message: params.erro }
      : null;

  return (
    <>
      <PageHeader title="E-mails" description="As caixas onde os boletos chegam." />
      <div className="px-5 pb-8 lg:px-7">
        <EmailAccountsManager accounts={accounts} notice={notice} />
      </div>
    </>
  );
}
