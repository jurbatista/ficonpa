import { NextResponse } from "next/server";
import { exchangeCode, OAUTH_STATE_COOKIE } from "@/lib/contaazul/oauth";
import { saveConnection } from "@/lib/contaazul/connection";
import { syncContaAzulCatalogs } from "@/lib/contaazul/sync";
import { appUrl } from "@/lib/env";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const storedState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.split("=")[1];

  const redirect = (status: string, message?: string) => {
    const target = new URL("/conexoes/conta-azul", appUrl());
    target.searchParams.set("status", status);
    if (message) target.searchParams.set("message", message.slice(0, 300));
    const response = NextResponse.redirect(target);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  };

  if (error) return redirect("error", error);
  if (!code) return redirect("error", "Código de autorização ausente.");
  if (!state || state !== storedState) {
    return redirect("error", "Estado OAuth inválido. Tente conectar novamente.");
  }

  try {
    const tokens = await exchangeCode(code);
    const connection = await saveConnection(tokens);
    let warning: string | undefined;
    try {
      await syncContaAzulCatalogs();
    } catch (syncError) {
      warning = syncError instanceof Error ? syncError.message : String(syncError);
    }
    await logAudit("conta_azul_connected", {
      entity: "conta_azul_connection",
      entityId: connection.id,
    });
    return redirect("ok", warning);
  } catch (callbackError) {
    const message =
      callbackError instanceof Error ? callbackError.message : String(callbackError);
    return redirect("error", message);
  }
}
