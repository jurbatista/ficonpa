import { readFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
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
import {
  loadRemotePriorCharges,
  localPriorCharges,
  matchWithSettings,
  RULE_DISCARD_NOTE,
  RULE_REVIEW_NOTE,
  UNVERIFIED_NOTE,
  type Charge,
  type PriorMatch,
} from "@/lib/rules/dedupe";
import { getSettings } from "@/lib/settings";
import { postPayable } from "@/lib/payables/post";
import { logAudit } from "@/lib/audit";
import { getOpenRouterApiKey } from "@/lib/config";

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
  originalValue: number | null;
  originalDueDate: string | null;
  reissue: boolean | null;
  emailFrom: string | null;
  emailSubject: string | null;
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
    `Valor antes de juros e multa: ${input.originalValue ?? "não informado"}`,
    `Vencimento original: ${input.originalDueDate ?? "não informado"}`,
    `Reenvio de cobrança vencida: ${input.reissue === null ? "não se sabe" : input.reissue ? "sim" : "não"}`,
    `Remetente do e-mail: ${input.emailFrom ?? "não identificado"}`,
    `Assunto do e-mail: ${input.emailSubject ?? "não identificado"}`,
    "",
    "Candidatos cadastrados no Conta Azul:",
    candidates,
    "",
    "Trecho do documento:",
    input.text.slice(0, 8000),
  ].join("\n");
}

type PayableValues = Omit<typeof payables.$inferInsert, "status" | "origin">;

type Writer = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update">;

/** Grava o lançamento do documento. Sem `status`, um lançamento que já existe mantém o dele. */
async function savePayable(db: Writer, values: PayableValues, status?: string): Promise<string> {
  const [existing] = await db
    .select({ id: payables.id })
    .from(payables)
    .where(eq(payables.referenciaExterna, values.referenciaExterna))
    .limit(1);

  if (existing) {
    await db
      .update(payables)
      .set(status ? { ...values, status } : values)
      .where(eq(payables.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(payables)
    .values({ ...values, status: status ?? "DRAFT", origin: "manual" })
    .returning({ id: payables.id });
  return created.id;
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

  // O que já está no Conta Azul não é lido de novo.
  const [posted] = await db
    .select({ id: payables.id })
    .from(payables)
    .where(and(eq(payables.documentId, documentId), eq(payables.status, "POSTED")))
    .limit(1);
  if (posted) {
    await db
      .update(documents)
      .set({ status: "POSTED", needsAttention: false, attentionReason: null })
      .where(eq(documents.id, documentId));
    return { documentId, status: "POSTED", autoPosted: false };
  }

  try {
    const buffer = await readFile(attachment.path);
    const pdf = await extractPdfText(buffer);

    if (pdf.pages > 20) {
      throw new Error(`PDF com ${pdf.pages} páginas (limite de 20).`);
    }

    const textData = parseBoletoText(pdf.text);
    let qwen: QwenExtraction | null = null;
    let qwenError: string | null = null;

    if (await getOpenRouterApiKey()) {
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
      qwenError = "Serviço de leitura não configurado: usando apenas a leitura direta do PDF.";
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
    // Só valem quando descrevem uma cobrança anterior a esta: valor menor, vencimento mais antigo.
    const originalValue =
      qwen?.valor_original && value && qwen.valor_original < value ? qwen.valor_original : null;
    const originalDueDate =
      qwen?.vencimento_original && dueDate && qwen.vencimento_original < dueDate
        ? qwen.vencimento_original
        : null;
    const reissue = qwen ? qwen.reemissao : null;

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
      originalValue,
      originalDueDate,
      reissue,
      emailFrom: message?.fromAddress ?? null,
      emailSubject: message?.subject ?? null,
      candidates: match.candidates,
      text: pdf.text,
    });

    let jev: JevDecision | null = null;
    if (settings.jevEnabled) {
      jev = await decideWithJev({
        model: settings.jevModel,
        state,
        candidates: match.candidates,
        rules: settings.customRules,
        sessionId: documentId,
      });
    }

    // Regras da empresa. null = há regras, mas não foi possível aplicá-las a este documento.
    const hasRules = settings.customRules.trim().length > 0;
    const ruleValue = (key: string) => (hasRules ? noulValue(jev?.answers[key]) : 0);
    const ruleDiscard = ruleValue("rule_discard");
    const ruleReview = ruleValue("rule_review");
    const ruleRepeat = ruleValue("rule_repeat");
    const rulesUnknown = ruleDiscard === null || ruleReview === null || ruleRepeat === null;

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
      originalValue,
      originalDueDate,
      reissue,
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

    const competenceDate = dueDate ?? new Date().toISOString().slice(0, 10);
    const basePayable = {
      documentId,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? supplierName,
      supplierDocument: supplier?.document ?? (supplierDocument || null),
      value: value ? value.toFixed(2) : null,
      dueDate,
      competenceDate,
      description: description ?? (supplier ? `Conta a pagar ${supplier.name}` : null),
      referenciaExterna: documentId,
      error: null,
      updatedAt: new Date(),
    };

    // Uma regra manda descartar: sai da fila, mas continua visível em "Descartados".
    if (ruleDiscard !== null && ruleDiscard >= settings.reviewThreshold) {
      const payableId = await savePayable(db, basePayable, "REJECTED");
      await db
        .update(documents)
        .set({
          ...baseUpdate,
          status: "REJECTED",
          needsAttention: false,
          attentionReason: RULE_DISCARD_NOTE,
        })
        .where(eq(documents.id, documentId));
      await logAudit("rule_discarded", {
        entity: "payable",
        entityId: payableId,
        actor: "sistema",
        payload: { ruleDiscard },
      });
      return { documentId, status: "REJECTED", autoPosted: false };
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

    const payableValues = {
      ...basePayable,
      categoryId: classification.categoryId,
      categoryName: classification.categoryName,
      financialAccountId: classification.financialAccountId,
      financialAccountName: classification.financialAccountName,
      costCenterId: classification.costCenterId,
      costCenterName: classification.costCenterName,
    };

    // A cobrança já existe? Vale a primeira, a não ser que uma regra autorize lançar de novo —
    // e mesmo a regra não libera uma cobrança idêntica (mesmo boleto, ou mesmo valor e vencimento).
    const charge: Charge | null =
      value && dueDate
        ? { supplierId: supplier.id, value, dueDate, linhaDigitavel, originalValue, originalDueDate, reissue }
        : null;
    const repeatAllowed = ruleRepeat !== null && ruleRepeat >= settings.reviewThreshold;
    const remote = charge
      ? await loadRemotePriorCharges(charge, settings)
      : { charges: [], unverified: false };

    const saved = await db.transaction(async (tx) => {
      // Dois boletos do mesmo fornecedor não são conferidos ao mesmo tempo:
      // o segundo espera o primeiro entrar na lista para ser comparado com ele.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payable:${supplier.id}`}))`);

      let prior: PriorMatch | null = null;
      if (charge) {
        const [existing] = await tx
          .select({ createdAt: payables.createdAt })
          .from(payables)
          .where(eq(payables.referenciaExterna, documentId))
          .limit(1);
        const local = await localPriorCharges(tx, {
          supplierId: supplier.id,
          documentId,
          createdBefore: existing?.createdAt,
        });
        prior = matchWithSettings(charge, [...local, ...remote.charges], settings);
        if (prior && prior.reason !== "same" && repeatAllowed) prior = null;
      }

      const payableId = await savePayable(
        tx,
        payableValues,
        prior?.kind === "duplicate" ? "REJECTED" : undefined,
      );
      return { payableId, prior };
    });
    const { payableId, prior } = saved;

    if (prior?.kind === "duplicate") {
      await db
        .update(documents)
        .set({
          ...baseUpdate,
          status: "DUPLICATE",
          needsAttention: false,
          attentionReason: prior.note,
        })
        .where(eq(documents.id, documentId));
      await logAudit("duplicate_discarded", {
        entity: "payable",
        entityId: payableId,
        actor: "sistema",
        payload: { reason: prior.reason, prior: prior.prior },
      });
      return { documentId, status: "DUPLICATE", autoPosted: false };
    }

    // Com o lançamento automático desligado tudo já passa por uma pessoa: o aviso da regra só aparece quando ela muda algo.
    const ruleAsksReview = ruleReview !== null && ruleReview >= 0.5;
    const attentionReason =
      prior?.note ??
      (remote.unverified ? UNVERIFIED_NOTE : null) ??
      (classification.resolved ? null : "Categoria ou conta financeira não resolvida por regra.") ??
      (ruleAsksReview && settings.autoPostEnabled ? RULE_REVIEW_NOTE : null);

    const autoEligible =
      settings.autoPostEnabled &&
      !jev?.failed &&
      autoPostProbability >= settings.autoPostThreshold &&
      matchMethod === "cnpj" &&
      quality >= 2 &&
      classification.resolved &&
      Boolean(value && dueDate && supplier.id) &&
      !rulesUnknown &&
      !ruleAsksReview &&
      (ruleDiscard ?? 1) < 0.5 &&
      !prior &&
      !remote.unverified;

    const nextStatus = classification.resolved ? "READY" : "NEEDS_ATTENTION";
    await db
      .update(documents)
      .set({
        ...baseUpdate,
        status: nextStatus,
        needsAttention: attentionReason !== null,
        attentionReason,
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
      // Só uma regra explícita dispensa a última conferência antes de lançar.
      const result = await postPayable(payableId, "automático", { confirmed: repeatAllowed });
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
