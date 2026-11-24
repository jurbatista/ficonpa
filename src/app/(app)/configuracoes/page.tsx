import { PageHeader } from "@/components/app/ui";
import { SettingsForm } from "@/components/app/settings-form";
import { RulesForm } from "@/components/app/rules-form";
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
      <PageHeader title="Configurações" />
      <div className="max-w-3xl space-y-5 px-5 pb-8 lg:px-7">
        <SettingsForm initial={settings} />

        <RulesForm initial={settings.customRules} />

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
            reissueMaxIncreasePercent: settings.reissueMaxIncreasePercent,
            reissueWindowDays: settings.reissueWindowDays,
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
