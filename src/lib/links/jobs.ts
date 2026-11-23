import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailLinks } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { storePdfAttachment } from "@/lib/mail/store";
import { NeedsHumanError } from "./agent";
import { CaptchaError, LinkGoneError, UnavailableError } from "./browser";
import { BlockedUrlError } from "./net-guard";
import { resolveUrl } from "./resolve";

export type LinkJobOutcome = { status: string; attachmentId?: string; error?: string };

function filenameFor(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return `boleto-${host}-${Date.now()}.pdf`;
}

/**
 * Processa um link da fila. Lança erro apenas quando o site está fora do ar,
 * para que a fila tente de novo mais tarde (sem reaprender).
 */
export async function resolveEmailLink(linkId: string, options: { final?: boolean } = {}): Promise<LinkJobOutcome> {
  const db = getDb();
  const [link] = await db.select().from(emailLinks).where(eq(emailLinks.id, linkId)).limit(1);
  if (!link) return { status: "MISSING" };
  if (link.status === "RESOLVED") return { status: "RESOLVED", attachmentId: link.attachmentId ?? undefined };

  const settings = await getSettings();
  await db
    .update(emailLinks)
    .set({ status: "RESOLVING", attempts: link.attempts + 1, error: null, updatedAt: new Date() })
    .where(eq(emailLinks.id, linkId));

  const progress: string[] = [];
  const finish = async (values: Partial<typeof emailLinks.$inferInsert>) => {
    await db
      .update(emailLinks)
      .set({ ...values, trace: progress.slice(-80) as never, updatedAt: new Date() })
      .where(eq(emailLinks.id, linkId));
  };

  try {
    const result = await resolveUrl(link.url, {
      model: settings.linkAgentModel,
      maxAttempts: settings.linkLearningAttempts,
      onProgress: (line) => progress.push(line),
    });

    let attachmentId: string | undefined;
    if (link.messageId) {
      const stored = await storePdfAttachment({
        messageId: link.messageId,
        filename: filenameFor(result.finalUrl),
        content: result.pdf.buffer,
        source: "link",
        sourceUrl: result.finalUrl,
      });
      attachmentId = stored.id;
    }

    await finish({
      status: "RESOLVED",
      method: result.method,
      finalUrl: result.finalUrl,
      recipeId: result.recipeId,
      attachmentId: attachmentId ?? null,
      error: null,
    });
    await logAudit("link_resolved", {
      entity: "email_link",
      entityId: linkId,
      actor: "sistema",
      payload: { method: result.method, host: new URL(result.finalUrl).hostname, recipeId: result.recipeId },
    });
    return { status: "RESOLVED", attachmentId };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    if (error instanceof UnavailableError) {
      // Fora do ar: não reaprende, só tenta de novo mais tarde (a menos que seja a última tentativa).
      await finish({ status: "UNAVAILABLE", error: message });
      if (!options.final) throw error;
      return { status: "UNAVAILABLE", error: message };
    }
    const status =
      error instanceof CaptchaError
        ? "CAPTCHA"
        : error instanceof LinkGoneError
          ? "NOT_FOUND"
          : error instanceof BlockedUrlError
            ? "BLOCKED"
            : error instanceof NeedsHumanError
              ? "NEEDS_HUMAN"
              : "FAILED";
    await finish({ status, error: message });
    await logAudit("link_failed", { entity: "email_link", entityId: linkId, actor: "sistema", payload: { status, error: message } });
    return { status, error: message };
  }
}
