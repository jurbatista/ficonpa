import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attachments, documents, emailMessages, payables } from "@/db/schema";
import { extractPdfText, parseBoletoText } from "@/lib/boleto/parse";
import { extractWithQwen, type QwenExtraction } from "@/lib/ai/qwen";
import {
  choiceValue,
  decideWithJev,
  noulValue,
  scoreValue,
  type JevDecision,
} from "@/lib/ai/jev";
import { findSupplierMatch, normalizeDocument } from "@/lib/rules/match-supplier";
import { classifyPayable } from "@/lib/rules/classify";
import { isDuplicatePayable } from "@/lib/rules/dedupe";
import { getSettings } from "@/lib/settings";
import { postPayable } from "@/lib/payables/post";
import { logAudit } from "@/lib/audit";
import { optionalEnv } from "@/lib/env";

export type ProcessResult = {
  documentId: string;
  status: string;
  autoPosted: boolean;
};

function buildJevState(input: {
  filename: string;
  isBoletoCandidate: boolean;
  linhaDigitavel: string | null;
  bankName: string | null;
  supplierName: string | null;
  supplierDocument: string | null;
  value: number | null;
  dueDate: string | null;
  nossoNumero: string | null;
  description: string | null;
  candidates: { id: string; name: string; document: string | null }[];
  text: string;
}): string {
  const candidates =
    input.candidates.length > 0
      ? input.candidates
          .map((candidate) => `- ${candidate.id}: ${candidate.name}${candidate.document ? ` (${candidate.document})` : ""}`)
          .join("\n")
      : "- nenhum candidato por nome";

  return [
    `Arquivo: ${input.filename}`,
    `Parece boleto (pré-análise): ${input.isBoletoCandidate ? "sim" : "não"}`,
    `Linha digitável: ${input.linhaDigitavel ?? "não encontrada"}`,
    `Banco: ${input.bankName ?? "não identificado"}`,
    `Beneficiário: ${input.supplierName ?? "não identificado"}`,
    `Documento do beneficiário: ${input.supplierDocument ?? "não identificado"}`,
    `Valor: ${input.value ?? "não identificado"}`,
    `Vencimento: ${input.dueDate ?? "não identificado"}`,
    `Nosso número: ${input.nossoNumero ?? "não identificado"}`,
    `Descrição: ${input.description ?? "não identificada"}`,
    "",
    "Candidatos cadastrados no Conta Azul:",
    candidates,
    "",
    "Trecho do documento:",
    input.text.slice(0, 8000),
  ].join("\n");
}

export async function processAttachment(
  attachmentId: string,
  options: { force?: boolean } = {},
): Promise<ProcessResult> {
  const db = getDb();
  const settings = await getSettings();

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!attachment) throw new Error("Anexo não encontrado.");

  const [message] = await db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.id, attachment.messageId))
    .limit(1);

  let [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.attachmentId, attachmentId))
    .limit(1);

  if (!document) {
    [document] = await db
      .insert(documents)
      .values({ attachmentId, status: "PENDING" })
      .returning();
  } else if (document.status !== "ERROR" && !options.force) {
    return { documentId: document.id, status: document.status, autoPosted: false };
  }

  const documentId = document.id;

  try {
    const buffer = await readFile(attachment.path);
    const pdf = await extractPdfText(buffer);

    if (pdf.pages > 20) {
      throw new Error(`PDF com ${pdf.pages} páginas (limite de 20).`);
    }

    const textData = parseBoletoText(pdf.text);
    let qwen: QwenExtraction | null = null;
    let qwenError: string | null = null;

    if (optionalEnv("OPENROUTER_API_KEY")) {
      try {
        qwen = await extractWithQwen({
          model: settings.qwenModel,
          text: pdf.text,
          pdfBase64: pdf.hasTextLayer ? undefined : buffer.toString("base64"),
          filename: attachment.filename,
          hasTextLayer: pdf.hasTextLayer,
        });
      } catch (error) {
        qwenError = error instanceof Error ? error.message : String(error);
      }
    } else {
      qwenError = "OPENROUTER_API_KEY ausente: usando apenas o parser determinístico.";
    }

    const linhaDigitavel = textData.linhaDigitavel ?? qwen?.linha_digitavel ?? null;
    const isBoletoCandidate = qwen?.is_boleto ?? Boolean(textData.linhaDigitavel);
    const value = textData.bank?.value ?? qwen?.valor ?? textData.valueFromText ?? null;
    const dueDate = textData.bank?.dueDate ?? qwen?.vencimento ?? textData.dueDateFromText ?? null;
    const supplierDocument = normalizeDocument(
      qwen?.beneficiario_documento ?? textData.cnpj ?? textData.cpf,
    );
    const supplierName = qwen?.beneficiario_nome ?? textData.beneficiaryHint ?? null;
    const bankName = textData.bank?.bankName ?? qwen?.banco ?? null;
    const nossoNumero = qwen?.nosso_numero ?? null;
    const description =
      qwen?.descricao ??
      (bankName || nossoNumero ? `Boleto ${bankName ?? ""} ${nossoNumero ?? ""}`.trim() : null);

    const match = await findSupplierMatch({
      document: supplierDocument || null,
      name: supplierName,
    });

    const state = buildJevState({
      filename: attachment.filename,
      isBoletoCandidate,
      linhaDigitavel,
      bankName,
      supplierName,
      supplierDocument: supplierDocument || null,
      value,
      dueDate,
      nossoNumero,
      description,
      candidates: match.candidates,
      text: pdf.text,
    });

    let jev: JevDecision | null = null;
    if (settings.jevEnabled) {
      jev = await decideWithJev({
        model: settings.jevModel,
        state,
        candidates: match.candidates,
        sessionId: documentId,
      });
    }

    const isBoletoProbability =
      noulValue(jev?.answers.is_boleto) ?? (isBoletoCandidate ? 0.9 : 0);
    const autoPostProbability = noulValue(jev?.answers.auto_post_safe) ?? 0;
    const quality = scoreValue(jev?.answers.extraction_quality) ?? 0;
    const jevSupplier = choiceValue(jev?.answers.supplier_match);
    const jevType = choiceValue(jev?.answers.document_type);

    let supplier = match.exact;
    let matchMethod: string = match.method;
    if (!supplier && jevSupplier && jevSupplier !== "none") {
      const candidate = match.candidates.find((item) => item.id === jevSupplier);
      if (candidate) {
        supplier = { id: candidate.id, name: candidate.name, document: candidate.document };
        matchMethod = "jev";
      }
    }

    const extractionPayload = {
      linhaDigitavel,
      bankName,
      nossoNumero,
      value,
      dueDate,
      supplierName,
      supplierDocument: supplierDocument || null,
      description,
      documentType: jevType,
      pages: pdf.pages,
      hasTextLayer: pdf.hasTextLayer,
      textPreview: pdf.text.slice(0, 1500),
      deterministic: textData,
      qwen,
      qwenError,
    };

    const jevPayload = jev
      ? {
          id: jev.id,
          model: jev.model,
          answers: jev.answers,
          cost: jev.cost,
          failed: jev.failed,
          error: jev.error,
          thresholds: {
            review: settings.reviewThreshold,
            autoPost: settings.autoPostThreshold,
          },
        }
      : null;

    const baseUpdate = {
      isBoleto: isBoletoProbability >= settings.reviewThreshold,
      confidence: isBoletoProbability.toFixed(3),
      extraction: extractionPayload as never,
      jev: jevPayload as never,
      matchMethod,
      matchConfidence: match.confidence.toFixed(3),
      error: null,
    };

    if (isBoletoProbability < settings.reviewThreshold) {
      await db
        .update(documents)
        .set({
          ...baseUpdate,
          status: "NOT_BOLETO",
          needsAttention: false,
          attentionReason: null,
        })
        .where(eq(documents.id, documentId));
      return { documentId, status: "NOT_BOLETO", autoPosted: false };
    }

    if (!supplier) {
      await db
        .update(documents)
        .set({
          ...baseUpdate,
          status: "NO_SUPPLIER",
          needsAttention: true,
          attentionReason: "Fornecedor não encontrado no Conta Azul.",
        })
        .where(eq(documents.id, documentId));
      return { documentId, status: "NO_SUPPLIER", autoPosted: false };
    }

    const classification = await classifyPayable({
      supplierId: supplier.id,
      supplierName: supplier.name,
      description,
    });

    if (await isDuplicatePayable({
      supplierId: supplier.id,
      supplierDocument: supplier.document,
      value,
      dueDate,
    })) {
      await db
        .update(documents)
        .set({
          ...baseUpdate,
          status: "DUPLICATE",
          needsAttention: false,
          attentionReason: null,
        })
        .where(eq(documents.id, documentId));
      return { documentId, status: "DUPLICATE", autoPosted: false };
    }

    const competenceDate = dueDate ?? new Date().toISOString().slice(0, 10);
    const observation = message
      ? `Importado do e-mail "${message.subject ?? ""}" em ${message.receivedAt?.toISOString().slice(0, 10) ?? ""}`
      : "Importado do e-mail";

    const payableValues = {
      documentId,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierDocument: supplier.document,
      categoryId: classification.categoryId,
      categoryName: classification.categoryName,
      financialAccountId: classification.financialAccountId,
      financialAccountName: classification.financialAccountName,
      costCenterId: classification.costCenterId,
      costCenterName: classification.costCenterName,
      value: value ? value.toFixed(2) : null,
      dueDate,
      competenceDate,
      description: description ?? `Conta a pagar ${supplier.name}`,
      referenciaExterna: documentId,
      error: null,
      updatedAt: new Date(),
    };

    const [existingPayable] = await db
      .select()
      .from(payables)
      .where(eq(payables.referenciaExterna, documentId))
      .limit(1);

    let payableId: string;
    if (existingPayable) {
      await db.update(payables).set(payableValues).where(eq(payables.id, existingPayable.id));
      payableId = existingPayable.id;
    } else {
      const [created] = await db
        .insert(payables)
        .values({ ...payableValues, status: "DRAFT", origin: "manual" })
        .returning({ id: payables.id });
      payableId = created.id;
    }

    const autoEligible =
      settings.autoPostEnabled &&
      !jev?.failed &&
      autoPostProbability >= settings.autoPostThreshold &&
      matchMethod === "cnpj" &&
      quality >= 2 &&
      classification.resolved &&
      Boolean(value && dueDate && supplier.id);

    const nextStatus = classification.resolved ? "READY" : "NEEDS_ATTENTION";
    await db
      .update(documents)
      .set({
        ...baseUpdate,
        status: nextStatus,
        needsAttention: !classification.resolved,
        attentionReason: classification.resolved
          ? null
          : "Categoria ou conta financeira não resolvida por regra.",
      })
      .where(eq(documents.id, documentId));

    if (autoEligible) {
      await db
        .update(payables)
        .set({ origin: "auto", status: "APPROVED" })
        .where(eq(payables.id, payableId));
      await logAudit("auto_post_triggered", {
        entity: "payable",
        entityId: payableId,
        actor: "sistema",
        payload: { autoPostProbability, quality, matchMethod },
      });
      const result = await postPayable(payableId, "automático");
      return {
        documentId,
        status: result.ok ? "POSTED" : "FAILED",
        autoPosted: result.ok,
      };
    }

    return { documentId, status: nextStatus, autoPosted: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(documents)
      .set({ status: "ERROR", error: message, needsAttention: true, attentionReason: message })
      .where(eq(documents.id, documentId));
    return { documentId, status: "ERROR", autoPosted: false };
  }
}
