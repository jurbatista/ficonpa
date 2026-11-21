import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  buildAuthorizeUrl,
  isContaAzulConfigured,
  OAUTH_STATE_COOKIE,
} from "@/lib/contaazul/oauth";
import { fail } from "@/lib/api";

export async function GET() {
  if (!isContaAzulConfigured()) {
    return fail(
      "Configure CONTA_AZUL_CLIENT_ID, CONTA_AZUL_CLIENT_SECRET e CONTA_AZUL_REDIRECT_URI.",
      400,
    );
  }
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
