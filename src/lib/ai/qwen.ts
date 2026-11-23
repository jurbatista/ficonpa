import { getOpenRouterApiKey } from "@/lib/config";
import {
  QWEN_PDF_PROMPT,
  QWEN_SYSTEM_PROMPT,
  QWEN_TEXT_PROMPT,
  qwenExtractionSchema,
} from "./prompts";

export type QwenExtraction = {
  is_boleto: boolean;
  tipo: "bancario" | "convenio" | "desconhecido";
  beneficiario_nome: string | null;
  beneficiario_documento: string | null;
  valor: number | null;
  vencimento: string | null;
  banco: string | null;
  nosso_numero: string | null;
  linha_digitavel: string | null;
  descricao: string | null;
  confianca: number;
  campos_incertos: string[];
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } };

export type QwenInput = {
  model: string;
  text?: string;
  pdfBase64?: string;
  filename?: string;
  hasTextLayer: boolean;
};

export async function extractWithQwen(input: QwenInput): Promise<QwenExtraction> {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("Serviço de leitura não configurado. Fale com o suporte.");
  }

  const content: ContentPart[] = [];
  if (input.hasTextLayer && input.text) {
    content.push({
      type: "text",
      text: `${QWEN_TEXT_PROMPT}${input.text.slice(0, 40_000)}`,
    });
  } else if (input.pdfBase64) {
    content.push({
      type: "file",
      file: {
        filename: input.filename ?? "boleto.pdf",
        file_data: `data:application/pdf;base64,${input.pdfBase64}`,
      },
    });
    content.push({ type: "text", text: QWEN_PDF_PROMPT });
  } else {
    throw new Error("Documento sem texto nem PDF para leitura.");
  }

  const body: Record<string, unknown> = {
    model: input.model,
    temperature: 0,
    max_tokens: 2000,
    messages: [
      { role: "system", content: QWEN_SYSTEM_PROMPT },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "boleto_extraction",
        strict: true,
        schema: qwenExtractionSchema,
      },
    },
  };

  if (!input.hasTextLayer) {
    body.plugins = [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }];
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Serviço de leitura indisponível (${response.status}): ${text.slice(0, 500)}`);
  }

  const payload = JSON.parse(text) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("A leitura do documento não retornou conteúdo.");

  const parsed = JSON.parse(raw) as QwenExtraction;
  return {
    ...parsed,
    confianca: Math.max(0, Math.min(1, Number(parsed.confianca ?? 0))),
    campos_incertos: Array.isArray(parsed.campos_incertos) ? parsed.campos_incertos : [],
  };
}
