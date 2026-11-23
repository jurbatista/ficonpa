import { z } from "zod";
import {
  getIntegrationConfig,
  getIntegrationConfigStatus,
  maskSecret,
  saveIntegrationConfig,
} from "@/lib/config";
import { errorMessage, fail, ok, readJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { microsoftRedirectUri } from "@/lib/mail/microsoft";

const schema = z.object({
  openrouterApiKey: z.string().max(1024).optional(),
  contaAzulClientId: z.string().max(1024).optional(),
  contaAzulClientSecret: z.string().max(1024).optional(),
  contaAzulRedirectUri: z
    .union([z.literal(""), z.string().url().max(2048)])
    .optional(),
  microsoftClientId: z.string().max(1024).optional(),
  microsoftClientSecret: z.string().max(1024).optional(),
});

async function view() {
  const [config, status] = await Promise.all([
    getIntegrationConfig(),
    getIntegrationConfigStatus(),
  ]);

  return {
    openrouterApiKey: maskSecret(config.openrouterApiKey),
    contaAzulClientId: config.contaAzulClientId,
    contaAzulClientSecret: maskSecret(config.contaAzulClientSecret),
    contaAzulRedirectUri: config.contaAzulRedirectUri,
    microsoftClientId: config.microsoftClientId,
    microsoftClientSecret: maskSecret(config.microsoftClientSecret),
    microsoftRedirectUri: microsoftRedirectUri(),
    status,
  };
}

export async function GET() {
  return ok(await view());
}

export async function PATCH(request: Request) {
  try {
    const body = await readJson<unknown>(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail("Dados de integração inválidos. Verifique a URL de redirecionamento.", 422);
    }

    const fields = Object.entries(parsed.data)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (fields.length === 0) return fail("Nenhuma alteração informada.", 422);

    await saveIntegrationConfig(parsed.data);
    await logAudit("integration_settings_updated", {
      payload: { fields },
      actor: "admin",
    });

    return ok(await view());
  } catch (error) {
    return fail(errorMessage(error));
  }
}
