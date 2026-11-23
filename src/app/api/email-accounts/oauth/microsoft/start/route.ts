import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildMicrosoftAuthorizeUrl, isMicrosoftConfigured, MS_STATE_COOKIE } from "@/lib/mail/microsoft";
import { isValidEmail } from "@/lib/mail/providers";
import { appUrl } from "@/lib/env";

export async function GET(request: Request) {
  const back = new URL("/conexoes/emails", appUrl());
  if (!(await isMicrosoftConfigured())) {
    back.searchParams.set("erro", "Login da Microsoft não configurado. Preencha Client ID e Secret em Configurações.");
    return NextResponse.redirect(back);
  }
  const email = (new URL(request.url).searchParams.get("email") ?? "").trim().toLowerCase();
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(
    await buildMicrosoftAuthorizeUrl(state, isValidEmail(email) ? email : undefined),
  );
  response.cookies.set(MS_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
