import { discoverMailProvider } from "@/lib/mail/providers";
import { isMicrosoftConfigured } from "@/lib/mail/microsoft";
import { errorMessage, fail, ok, readJson } from "@/lib/api";

/** A partir do e-mail, devolve o provedor e como conectar. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ email?: string }>(request);
    const discovery = await discoverMailProvider(body.email ?? "");
    return ok({
      ...discovery,
      microsoftConfigured: discovery.provider.auth === "microsoft" ? await isMicrosoftConfigured() : false,
    });
  } catch (error) {
    return fail(errorMessage(error), 422);
  }
}
