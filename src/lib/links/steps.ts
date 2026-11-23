/** Tipos e descrição dos passos de uma receita (sem dependências: pode ser usado pela UI). */

export type ElementLocator = {
  /** Seletor CSS estável (só id/name fixos). */
  css?: string;
  /** Texto visível do elemento (match exato, sem diferenciar maiúsculas). */
  text?: string;
  /** Trecho fixo do href (ex.: "/b/pdf/"). */
  hrefContains?: string;
  tag?: string;
};

export type RecipeStep =
  | { op: "goto"; url: string }
  | { op: "fetchPdf"; url: string }
  | { op: "click"; target: ElementLocator; description?: string }
  | { op: "wait"; ms: number };

export function describeSteps(steps: RecipeStep[]): string {
  return steps
    .map((step) => {
      if (step.op === "goto" || step.op === "fetchPdf") return `${step.op} ${step.url}`;
      if (step.op === "click") return `clicar ${step.target.text ? `"${step.target.text}"` : step.target.css ?? step.target.hrefContains ?? "?"}`;
      return `esperar ${step.ms}ms`;
    })
    .join(" → ");
}
