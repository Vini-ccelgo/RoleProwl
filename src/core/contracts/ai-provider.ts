import type { z } from "zod";

export const AI_TASKS = [
  "RESUME_FACT_EXTRACTION",
  "JOB_REQUIREMENT_NORMALIZATION",
  "SEMANTIC_EVIDENCE_COMPARISON",
  "APPLICATION_QUESTION_CLASSIFICATION",
  "FREE_TEXT_APPLICATION_GENERATION",
  "RESUME_TAILORING",
  "COVER_LETTER_GENERATION",
] as const;

export type AITask = (typeof AI_TASKS)[number];

export interface StructuredAIRequest<T> {
  readonly correlationId: string;
  readonly input: unknown;
  readonly promptVersion: string;
  readonly schema: z.ZodType<T>;
  readonly schemaName: string;
  readonly system: string;
  readonly task: AITask;
}

export interface AIUsageMetadata {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

export interface StructuredAIResult<T> {
  readonly data: T;
  readonly metadata: {
    readonly correlationId: string;
    readonly model: string;
    readonly promptVersion: string;
    readonly providerRequestId: string | null;
    readonly task: AITask;
    readonly usage: AIUsageMetadata;
  };
}

export interface AIProvider {
  generateStructured<T>(
    request: StructuredAIRequest<T>,
  ): Promise<StructuredAIResult<T>>;
}
