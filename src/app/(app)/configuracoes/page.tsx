import { PageHeader } from "@/components/app/ui";
import { SettingsForm } from "@/components/app/settings-form";
import { IntegrationSettings } from "@/components/app/integration-settings";
import { PasswordForm } from "@/components/app/password-form";
import { getSettings } from "@/lib/settings";
import {
  getIntegrationConfig,
  getIntegrationConfigStatus,
  getPasswordSource,
  maskSecret,
} from "@/lib/config";

export const dynamic = "force-dynamic";

function sanitizeUrl(value: string | undefined): string {
  if (!value) return "Não configurado";
  try {
    const url = new URL(value);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return "Configurado";
  }
}

function hidden(value: string | undefined): string {
  return value ? "Configurado (oculto)" : "Não configurado";
}

export default async function SettingsPage() {
  const [settings, integration, integrationStatus, passwordSource] = await Promise.all([
    getSettings(),
    getIntegrationConfig(),
    getIntegrationConfigStatus(),
    getPasswordSource(),
  ]);

  const diagnostics = [
    {
      name: "APP_URL",
      value: process.env.APP_URL || "http://localhost:3000",
      note: "URL pública usada em redirecionamentos.",
    },
    {
      name: "DATABASE_URL",
      value: sanitizeUrl(process.env.DATABASE_URL),
      note: "Conexão com o Postgres.",
    },
    {
      name: "REDIS_URL",
      value: sanitizeUrl(process.env.REDIS_URL),
      note: "Conexão com o Redis usado pelas filas.",
    },
    {
      name: "ATTACHMENT_DIR",
      value: process.env.ATTACHMENT_DIR || "./data/attachments",
      note: "Pasta onde os PDFs ficam temporariamente.",
    },
    {
      name: "AUTH_SECRET",
      value: hidden(process.env.AUTH_SECRET),
      note: "Assinatura do cookie de sessão.",
    },
    {
      name: "APP_ENCRYPTION_KEY",
      value: hidden(process.env.APP_ENCRYPTION_KEY),
      note: "Chave AES-256-GCM das credenciais salvas.",
    },
  ];

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Automação, integrações, segurança, modelos de IA e retenção de dados."
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

        <PasswordForm source={passwordSource} />

        <div className="rounded-xl border border-card-border bg-card-background p-5 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">Fail closed</p>
          <p className="mt-1 text-xs leading-5">
            Se o Jev recusar, não responder ou retornar baixa confiança, o item vai para revisão
            humana. O lançamento automático exige: toggle ligado, confiança ≥ limiar, match por
            CNPJ, qualidade ≥ 2, classificação resolvida e nenhuma duplicidade.
          </p>
        </div>

        <div className="rounded-xl border border-card-border bg-card-background p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-text-primary">Diagnóstico do ambiente</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Variáveis de infraestrutura somente leitura. Alterações exigem editar o{" "}
                <code>.env</code> e reiniciar os serviços.
              </p>
            </div>
            <span className="rounded-full border border-card-border px-2.5 py-1 text-xs text-text-tertiary">
              Somente leitura
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-card-border text-xs uppercase tracking-wide text-text-tertiary">
                  <th className="py-2 pr-4 font-medium">Variável</th>
                  <th className="py-2 pr-4 font-medium">Valor</th>
                  <th className="py-2 font-medium">Uso</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.map((item) => (
                  <tr key={item.name} className="border-b border-card-border last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs text-text-primary">{item.name}</td>
                    <td className="py-2.5 pr-4 text-xs text-text-secondary">{item.value}</td>
                    <td className="py-2.5 text-xs text-text-tertiary">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
