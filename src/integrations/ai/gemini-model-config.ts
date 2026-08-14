import type {
  AIModelPreference,
  AITask,
  StructuredAIRequest,
} from "@/core/contracts/ai-provider";

export type GeminiModelTier = "LITE" | "FLASH";

interface GeminiTaskRoute {
  readonly allowFlashEscalation: boolean;
  readonly preferredTier: GeminiModelTier;
}

export const GEMINI_TASK_ROUTES: Readonly<Record<AITask, GeminiTaskRoute>> = {
  RESUME_FACT_EXTRACTION: {
    preferredTier: "LITE",
    allowFlashEscalation: false,
  },
  JOB_REQUIREMENT_NORMALIZATION: {
    preferredTier: "LITE",
    allowFlashEscalation: true,
  },
  SEMANTIC_EVIDENCE_COMPARISON: {
    preferredTier: "LITE",
    allowFlashEscalation: true,
  },
  APPLICATION_QUESTION_CLASSIFICATION: {
    preferredTier: "LITE",
    allowFlashEscalation: false,
  },
  FREE_TEXT_APPLICATION_GENERATION: {
    preferredTier: "LITE",
    allowFlashEscalation: true,
  },
  RESUME_TAILORING: {
    preferredTier: "FLASH",
    allowFlashEscalation: false,
  },
  COVER_LETTER_GENERATION: {
    preferredTier: "FLASH",
    allowFlashEscalation: false,
  },
};

export function routeGeminiTask(
  request: Pick<
    StructuredAIRequest<unknown>,
    "allowFlashEscalation" | "modelPreference" | "task"
  >,
) {
  const configured = GEMINI_TASK_ROUTES[request.task];
  const preference: AIModelPreference =
    request.modelPreference ?? configured.preferredTier;
  return {
    preferredTier: preference,
    allowFlashEscalation:
      preference === "LITE" &&
      (request.allowFlashEscalation ?? configured.allowFlashEscalation),
  } as const;
}

export interface GeminiRuntimeConfig {
  readonly flashModel: string;
  readonly flashRpdLimit: number;
  readonly flashRpmLimit: number;
  readonly liteModel: string;
  readonly liteRpdLimit: number;
  readonly liteRpmLimit: number;
  readonly maxRetries: number;
  readonly timeoutMs: number;
}

export function geminiModelConfig(environment: {
  readonly ROLEPROWL_AI_MAX_RETRIES: number;
  readonly ROLEPROWL_AI_TIMEOUT_MS: number;
  readonly ROLEPROWL_GEMINI_FLASH_RPD_LIMIT: number;
  readonly ROLEPROWL_GEMINI_FLASH_RPM_LIMIT: number;
  readonly ROLEPROWL_GEMINI_LITE_RPD_LIMIT: number;
  readonly ROLEPROWL_GEMINI_LITE_RPM_LIMIT: number;
  readonly ROLEPROWL_GEMINI_MODEL_FLASH: string;
  readonly ROLEPROWL_GEMINI_MODEL_LITE: string;
}): GeminiRuntimeConfig {
  return {
    flashModel: environment.ROLEPROWL_GEMINI_MODEL_FLASH,
    flashRpdLimit: environment.ROLEPROWL_GEMINI_FLASH_RPD_LIMIT,
    flashRpmLimit: environment.ROLEPROWL_GEMINI_FLASH_RPM_LIMIT,
    liteModel: environment.ROLEPROWL_GEMINI_MODEL_LITE,
    liteRpdLimit: environment.ROLEPROWL_GEMINI_LITE_RPD_LIMIT,
    liteRpmLimit: environment.ROLEPROWL_GEMINI_LITE_RPM_LIMIT,
    maxRetries: environment.ROLEPROWL_AI_MAX_RETRIES,
    timeoutMs: environment.ROLEPROWL_AI_TIMEOUT_MS,
  };
}

export function modelForGeminiTier(
  config: GeminiRuntimeConfig,
  tier: GeminiModelTier,
) {
  return tier === "FLASH" ? config.flashModel : config.liteModel;
}

export function limitsForGeminiTier(
  config: GeminiRuntimeConfig,
  tier: GeminiModelTier,
) {
  return tier === "FLASH"
    ? { rpm: config.flashRpmLimit, rpd: config.flashRpdLimit }
    : { rpm: config.liteRpmLimit, rpd: config.liteRpdLimit };
}
