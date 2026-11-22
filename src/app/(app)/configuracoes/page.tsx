import { PageHeader } from "@/components/app/ui";
import { SettingsForm } from "@/components/app/settings-form";
import { IntegrationSettings } from "@/components/app/integration-settings";
import { PasswordForm } from "@/components/app/password-form";
import { getSettings } from "@/lib/settings";
import {
  getIntegrationConfig,
  getIntegrationConfigStatus,
  maskSecret,
} from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, integration, integrationStatus] = await Promise.all([
    getSettings(),
    getIntegrationConfig(),
    getIntegrationConfigStatus(),
  ]);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Automação, integrações, segurança e retenção de dados."
      />
      <div className="space-y-5 px-5 pb-8 lg:px-7">
        <SettingsForm initial={settings} />

        <IntegrationSettings
          data={{
            openrouterApiKey: maskSecret(integration.openrouterApiKey),
            contaAzulClientId: integration.contaAzulClientId,
            contaAzulClientSecret: maskSecret(integration.contaAzulClientSecret),
            contaAzulRedirectUri: integration.contaAzulRedirectUri,
            status: integrationStatus,
          }}
        />

        <PasswordForm />
      </div>
    </>
  );
}
