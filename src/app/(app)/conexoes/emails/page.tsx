import { EmailAccountsManager, type EmailAccountView } from "@/components/app/email-accounts-manager";
import { PageHeader } from "@/components/app/ui";
import { listEmailAccounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EmailAccountsPage() {
  const rows = await listEmailAccounts();

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
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="E-mails"
        description="Caixas IMAP que alimentam a triagem de boletos. Use senhas de aplicativo."
      />
      <div className="px-5 pb-8 lg:px-7">
        <EmailAccountsManager accounts={accounts} />
      </div>
    </>
  );
}
