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
export type AIModelPreference = "LITE" | "FLASH";
export type AIProviderName = "deterministic" | "gemini" | "openai";
export type AICapacityState =
  | "AVAILABLE"
  | "NEAR_LIMIT"
  | "LIMIT_REACHED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE";

export interface StructuredAIRequest<T> {
  readonly allowFlashEscalation?: boolean;
  readonly correlationId: string;
  readonly input: unknown;
  readonly modelPreference?: AIModelPreference;
  readonly promptVersion: string;
  readonly schema: z.ZodType<T>;
  readonly schemaName: string;
  readonly system: string;
  readonly task: AITask;
  readonly rateLimitSubject: string;
}

export interface AIUsageMetadata {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

export interface StructuredAIResult<T> {
  readonly data: T;
  readonly metadata: {
    readonly capacityState?: AICapacityState;
    readonly correlationId: string;
    readonly latencyMs: number;
    readonly model: string;
    readonly provider: AIProviderName;
    readonly promptVersion: string;
    readonly providerRequestId: string | null;
    readonly retryCount: number;
    readonly schemaVersion: string;
    readonly status: "SUCCEEDED";
    readonly task: AITask;
    readonly usage: AIUsageMetadata;
  };
}

export interface AIProvider {
  generateStructured<T>(
    request: StructuredAIRequest<T>,
  ): Promise<StructuredAIResult<T>>;
}
