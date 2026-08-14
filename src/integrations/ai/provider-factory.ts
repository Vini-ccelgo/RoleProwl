import "server-only";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type {
  AIProvider,
  StructuredAIRequest,
} from "@/core/contracts/ai-provider";
import type { RateLimiter } from "@/core/contracts/rate-limiter";
import { ConfigurationError } from "@/core/errors/application-errors";
import { PrismaRateLimiter } from "@/integrations/security/prisma-rate-limiter";
import { geminiEnv, selectedAIProviderEnv } from "@/lib/env/server";
import type { Logger } from "@/lib/logging/logger";
import { logger } from "@/lib/logging/logger";
import { DeterministicAIProvider } from "./deterministic-ai-provider";
import { geminiModelConfig } from "./gemini-model-config";
import { GeminiAIProvider, type GeminiGenerateClient } from "./gemini-provider";
import { openAIRequestOptions } from "./openai-model-config";
import { OpenAIProvider } from "./openai-provider";

export interface AIProviderFactoryOptions {
  readonly deterministicResolver?: (
    request: StructuredAIRequest<unknown>,
  ) => unknown;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly geminiClient?: GeminiGenerateClient;
  readonly log?: Logger;
  readonly openAIClient?: OpenAI;
  readonly rateLimiter?: RateLimiter;
}

export function resolveAIProvider(
  options: AIProviderFactoryOptions = {},
): AIProvider {
  const environment = options.environment ?? process.env;
  const provider = selectedAIProviderEnv(environment);
  if (provider === "deterministic") {
    if (!options.deterministicResolver)
      throw new ConfigurationError(
        "The deterministic AI provider requires an explicit test resolver.",
      );
    return new DeterministicAIProvider(options.deterministicResolver);
  }
  if (provider === "openai") {
    const apiKey = environment.OPENAI_API_KEY?.trim();
    if (!apiKey)
      throw new ConfigurationError(
        "OPENAI_API_KEY is required when AI_PROVIDER=openai.",
      );
    return new OpenAIProvider(
      options.openAIClient ??
        new OpenAI({ apiKey, ...openAIRequestOptions(environment) }),
      options.log ?? logger,
      options.rateLimiter ?? new PrismaRateLimiter(),
    );
  }
  try {
    const config = geminiEnv(environment);
    const client = options.geminiClient
      ? null
      : new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    return new GeminiAIProvider(
      options.geminiClient ?? client!.models,
      geminiModelConfig(config),
      options.log ?? logger,
      options.rateLimiter ?? new PrismaRateLimiter(),
    );
  } catch (error) {
    throw new ConfigurationError(
      error instanceof Error
        ? error.message
        : "Gemini AI configuration is invalid.",
    );
  }
}

export function currentAIProvider() {
  return resolveAIProvider();
}
