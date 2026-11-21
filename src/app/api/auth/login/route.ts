import { NextResponse } from "next/server";
import { checkPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { fail, readJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const body = await readJson<{ password?: string }>(request).catch(() => ({ password: "" }));
  if (!body.password || !checkPassword(body.password)) {
    await logAudit("login_failed", { actor: "desconhecido" });
    return fail("Senha incorreta.", 401);
  }
  const token = await createSessionToken();
  await setSessionCookie(token);
  await logAudit("login_success", { actor: "admin" });
  return NextResponse.json({ ok: true });
}
