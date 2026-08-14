import "server-only";
import type { AITask } from "@/core/contracts/ai-provider";
import { validateServerEnvironment } from "@/lib/env/server";

const ENV_BY_TASK: Record<AITask, string> = {
  RESUME_FACT_EXTRACTION: "ROLEPROWL_AI_MODEL_RESUME_FACT_EXTRACTION",
  JOB_REQUIREMENT_NORMALIZATION:
    "ROLEPROWL_AI_MODEL_JOB_REQUIREMENT_NORMALIZATION",
  SEMANTIC_EVIDENCE_COMPARISON:
    "ROLEPROWL_AI_MODEL_SEMANTIC_EVIDENCE_COMPARISON",
  APPLICATION_QUESTION_CLASSIFICATION:
    "ROLEPROWL_AI_MODEL_APPLICATION_QUESTION_CLASSIFICATION",
  FREE_TEXT_APPLICATION_GENERATION:
    "ROLEPROWL_AI_MODEL_FREE_TEXT_APPLICATION_GENERATION",
  RESUME_TAILORING: "ROLEPROWL_AI_MODEL_RESUME_TAILORING",
  COVER_LETTER_GENERATION: "ROLEPROWL_AI_MODEL_COVER_LETTER_GENERATION",
};

export function modelForTask(task: AITask) {
  return (
    process.env[ENV_BY_TASK[task]]?.trim() ||
    process.env.ROLEPROWL_AI_MODEL_DEFAULT?.trim() ||
    "gpt-5.6-luna"
  );
}

export function openAIRequestOptions() {
  const environment = validateServerEnvironment();
  return {
    timeout: environment.ROLEPROWL_AI_TIMEOUT_MS ?? 30_000,
    maxRetries: environment.ROLEPROWL_AI_MAX_RETRIES ?? 2,
  };
}
