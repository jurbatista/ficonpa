import { PageHeader } from "@/components/app/ui";
import { SettingsForm } from "@/components/app/settings-form";
import { getSettings } from "@/lib/settings";
import { optionalEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Automação, limiares de confiança, modelos e retenção de dados."
      />
      <div className="space-y-5 px-5 pb-8 lg:px-7">
        <div className="grid gap-3 rounded-xl border border-card-border bg-card-background p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-text-tertiary">OpenRouter</p>
            <p className="text-sm font-medium text-text-primary">
              {optionalEnv("OPENROUTER_API_KEY") ? "Configurado" : "Ausente"}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Conta Azul</p>
            <p className="text-sm font-medium text-text-primary">
              {optionalEnv("CONTA_AZUL_CLIENT_ID") ? "Configurado" : "Ausente"}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Criptografia</p>
            <p className="text-sm font-medium text-text-primary">
              {optionalEnv("APP_ENCRYPTION_KEY") ? "Ativa" : "Usando fallback"}
            </p>
          </div>
        </div>

        <SettingsForm initial={settings} />

        <div className="rounded-xl border border-card-border bg-card-background p-5 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">Fail closed</p>
          <p className="mt-1 text-xs leading-5">
            Se o Jev recusar, não responder ou retornar baixa confiança, o item vai para revisão
            humana. O lançamento automático exige: toggle ligado, confiança ≥ limiar, match por
            CNPJ, qualidade ≥ 2, classificação resolvida e nenhuma duplicidade.
          </p>
        </div>
      </div>
    </>
  );
}
