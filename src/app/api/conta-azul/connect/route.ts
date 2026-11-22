import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  buildAuthorizeUrl,
  isContaAzulConfigured,
  OAUTH_STATE_COOKIE,
} from "@/lib/contaazul/oauth";
import { fail } from "@/lib/api";

export async function GET() {
  if (!(await isContaAzulConfigured())) {
    return fail(
      "Configure o Client ID e o Client Secret do Conta Azul em Configurações.",
      400,
    );
  }
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(await buildAuthorizeUrl(state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
