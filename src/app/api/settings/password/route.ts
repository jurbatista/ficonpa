import { z } from "zod";
import { checkPassword } from "@/lib/auth";
import { setPasswordHash } from "@/lib/config";
import { hashPassword } from "@/lib/crypto";
import { errorMessage, fail, ok, readJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(256),
});

export async function POST(request: Request) {
  try {
    const body = await readJson<unknown>(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail("A nova senha deve ter entre 8 e 256 caracteres.", 422);
    }

    const { currentPassword, newPassword } = parsed.data;
    if (!(await checkPassword(currentPassword))) {
      return fail("Senha atual incorreta.", 401);
    }
    if (currentPassword === newPassword) {
      return fail("A nova senha deve ser diferente da atual.", 422);
    }

    await setPasswordHash(hashPassword(newPassword));
    await logAudit("password_changed", { actor: "admin" });

    return ok({ updated: true });
  } catch (error) {
    return fail(errorMessage(error));
  }
}
