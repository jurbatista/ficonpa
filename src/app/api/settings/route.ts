import { z } from "zod";
import { getSettings, updateSettings } from "@/lib/settings";
import { errorMessage, fail, ok, readJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  autoPostEnabled: z.boolean().optional(),
  autoPostThreshold: z.number().min(0.5).max(1).optional(),
  reviewThreshold: z.number().min(0.5).max(1).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  jevEnabled: z.boolean().optional(),
  jevModel: z.string().min(1).optional(),
  qwenModel: z.string().min(1).optional(),
  linkResolverEnabled: z.boolean().optional(),
  linkAgentModel: z.string().min(1).optional(),
  linkLearningAttempts: z.number().int().min(1).max(6).optional(),
});

export async function GET() {
  return ok(await getSettings());
}

export async function PATCH(request: Request) {
  try {
    const body = await readJson<unknown>(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail("Configurações inválidas.", 422);
    if (
      parsed.data.autoPostThreshold !== undefined &&
      parsed.data.reviewThreshold !== undefined &&
      parsed.data.autoPostThreshold < parsed.data.reviewThreshold
    ) {
      return fail("O limiar de lançamento automático deve ser maior que o de revisão.");
    }
    const settings = await updateSettings(parsed.data);
    await logAudit("settings_updated", { payload: parsed.data, actor: "admin" });
    return ok(settings);
  } catch (error) {
    return fail(errorMessage(error));
  }
}
