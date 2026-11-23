import { PageHeader } from "@/components/app/ui";
import { SettingsForm } from "@/components/app/settings-form";
import { TechnicalSettings } from "@/components/app/technical-settings";
import { PasswordForm } from "@/components/app/password-form";
import { microsoftRedirectUri } from "@/lib/mail/microsoft";
import { getSettings, toPublicSettings } from "@/lib/settings";
import {
  getIntegrationConfig,
  getIntegrationConfigStatus,
  maskSecret,
} from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [allSettings, integration, status] = await Promise.all([
    getSettings(),
    getIntegrationConfig(),
    getIntegrationConfigStatus(),
  ]);
  // Só o que a tela usa vai para o navegador.
  const settings = toPublicSettings(allSettings);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Como o sistema trabalha, por quanto tempo guarda os dados e a senha de acesso."
      />
      <div className="max-w-4xl space-y-5 px-5 pb-8 lg:px-7">
        <SettingsForm initial={settings} />

        <PasswordForm />

        <TechnicalSettings
          data={{
            contaAzulClientId: integration.contaAzulClientId,
            contaAzulClientSecret: maskSecret(integration.contaAzulClientSecret),
            contaAzulRedirectUri: integration.contaAzulRedirectUri,
            microsoftClientId: integration.microsoftClientId,
            microsoftClientSecret: maskSecret(integration.microsoftClientSecret),
            microsoftRedirectUri: microsoftRedirectUri(),
            reviewThreshold: settings.reviewThreshold,
            linkLearningAttempts: settings.linkLearningAttempts,
            status: {
              contaAzulClientId: status.contaAzulClientId,
              contaAzulClientSecret: status.contaAzulClientSecret,
              contaAzulRedirectUri: status.contaAzulRedirectUri,
              microsoftClientId: status.microsoftClientId,
              microsoftClientSecret: status.microsoftClientSecret,
            },
          }}
        />
      </div>
    </>
  );
}
