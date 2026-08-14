import "server-only";
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { z } from "zod";
import type {
  AICapacityState,
  AIProvider,
  StructuredAIRequest,
  StructuredAIResult,
} from "@/core/contracts/ai-provider";
import type { RateLimiter } from "@/core/contracts/rate-limiter";
import {
  AIInvalidOutputError,
  AIProviderCapacityError,
  AIRefusalError,
  IntegrationError,
} from "@/core/errors/application-errors";
import { AllowAllRateLimiter } from "@/integrations/security/prisma-rate-limiter";
import type { Logger } from "@/lib/logging/logger";
import { logger } from "@/lib/logging/logger";
import {
  serializeBoundedAIInput,
  validateAIRequestMetadata,
} from "@/lib/security/ai-input";
import {
  limitsForGeminiTier,
  modelForGeminiTier,
  routeGeminiTask,
  type GeminiModelTier,
  type GeminiRuntimeConfig,
} from "./gemini-model-config";

export interface GeminiGenerateClient {
  generateContent(
    parameters: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;
}

interface GeminiProviderOptions {
  readonly random?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

class GeminiTimeoutError extends Error {}

function httpStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) ? status : null;
}

function retryAfterSeconds(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const direct = Number(
    (error as { retryAfterSeconds?: unknown }).retryAfterSeconds,
  );
  if (Number.isFinite(direct) && direct >= 0) return direct;
  const headers = (error as { headers?: unknown }).headers;
  if (headers && typeof headers === "object" && "get" in headers) {
    const raw = (headers as { get(name: string): string | null }).get(
      "retry-after",
    );
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  }
  return null;
}

function retryableProviderError(error: unknown) {
  const status = httpStatus(error);
  return status != null && status >= 500 && status <= 599;
}

function isRefusal(response: GenerateContentResponse) {
  if (response.promptFeedback?.blockReason) return true;
  const finishReason = String(response.candidates?.[0]?.finishReason ?? "");
  return [
    "BLOCKLIST",
    "PROHIBITED_CONTENT",
    "RECITATION",
    "SAFETY",
    "SPII",
  ].includes(finishReason);
}

function jsonSchemaForProvider(schema: z.ZodType) {
  const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" });
  if (jsonSchema && typeof jsonSchema === "object" && "$schema" in jsonSchema)
    delete (jsonSchema as { $schema?: unknown }).$schema;
  return jsonSchema;
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export class GeminiAIProvider implements AIProvider {
  private readonly random: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly client: GeminiGenerateClient,
    private readonly config: GeminiRuntimeConfig,
    private readonly log: Logger = logger,
    private readonly rateLimiter: RateLimiter = new AllowAllRateLimiter(),
    options: GeminiProviderOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async generateStructured<T>(
    request: StructuredAIRequest<T>,
  ): Promise<StructuredAIResult<T>> {
    validateAIRequestMetadata(request);
    const serializedInput = serializeBoundedAIInput(request.input);
    const route = routeGeminiTask(request);
    try {
      return await this.generateOnTier(
        request,
        serializedInput,
        route.preferredTier,
      );
    } catch (error) {
      if (
        route.preferredTier === "LITE" &&
        route.allowFlashEscalation &&
        error instanceof AIInvalidOutputError
      ) {
        this.log.log("info", "ai_task_escalated", {
          correlationId: request.correlationId,
          task: request.task,
          fromModel: this.config.liteModel,
          toModel: this.config.flashModel,
          reason: "schema_validation",
        });
        return this.generateOnTier(request, serializedInput, "FLASH");
      }
      throw error;
    }
  }

  private async generateOnTier<T>(
    request: StructuredAIRequest<T>,
    serializedInput: string,
    tier: GeminiModelTier,
  ): Promise<StructuredAIResult<T>> {
    const model = modelForGeminiTier(this.config, tier);
    const startedAt = Date.now();
    let capacityState: AICapacityState = "AVAILABLE";

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        capacityState = await this.consumeCapacity(model, tier);
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let response: GenerateContentResponse;
        try {
          response = await Promise.race([
            this.client.generateContent({
              model,
              contents: serializedInput,
              config: {
                abortSignal: controller.signal,
                responseMimeType: "application/json",
                responseJsonSchema: jsonSchemaForProvider(request.schema),
                systemInstruction: request.system,
              },
            }),
            new Promise<never>(
              (_, reject) =>
                (timeout = setTimeout(() => {
                  controller.abort();
                  reject(new GeminiTimeoutError("Gemini timed out"));
                }, this.config.timeoutMs)),
            ),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
        if (isRefusal(response)) throw new AIRefusalError();
        if (!response.text)
          throw new AIInvalidOutputError(
            "The Gemini provider returned no structured payload.",
          );
        let decoded: unknown;
        try {
          decoded = JSON.parse(response.text);
        } catch (error) {
          throw new AIInvalidOutputError(
            "The Gemini provider returned malformed structured output.",
            error,
          );
        }
        const parsed = request.schema.safeParse(decoded);
        if (!parsed.success)
          throw new AIInvalidOutputError(
            "The Gemini provider output violated the RoleProwl schema.",
            parsed.error,
          );
        const usage = {
          inputTokens: response.usageMetadata?.promptTokenCount ?? null,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
          totalTokens: response.usageMetadata?.totalTokenCount ?? null,
        };
        const latencyMs = Date.now() - startedAt;
        this.log.log("info", "ai_task_completed", {
          provider: "gemini",
          correlationId: request.correlationId,
          task: request.task,
          promptVersion: request.promptVersion,
          schemaVersion: request.schemaName,
          model,
          latencyMs,
          totalTokens: usage.totalTokens,
          retryCount: attempt,
          status: "SUCCEEDED",
        });
        return {
          data: parsed.data,
          metadata: {
            capacityState,
            correlationId: request.correlationId,
            latencyMs,
            model,
            provider: "gemini",
            promptVersion: request.promptVersion,
            providerRequestId: response.responseId ?? null,
            retryCount: attempt,
            schemaVersion: request.schemaName,
            status: "SUCCEEDED",
            task: request.task,
            usage,
          },
        };
      } catch (error) {
        this.log.log("warn", "ai_task_attempt_failed", {
          provider: "gemini",
          correlationId: request.correlationId,
          task: request.task,
          promptVersion: request.promptVersion,
          schemaVersion: request.schemaName,
          model,
          latencyMs: Date.now() - startedAt,
          retryCount: attempt,
          errorType: error instanceof Error ? error.name : "unknown",
        });
        if (
          error instanceof AIRefusalError ||
          error instanceof AIProviderCapacityError
        )
          throw error;
        const status = httpStatus(error);
        const retryable =
          error instanceof GeminiTimeoutError ||
          error instanceof AIInvalidOutputError ||
          status === 429 ||
          retryableProviderError(error);
        if (retryable && attempt < this.config.maxRetries) {
          const providerDelay = retryAfterSeconds(error);
          const exponentialDelay = Math.min(8_000, 500 * 2 ** attempt);
          const jitter = Math.floor(this.random() * 250);
          await this.sleep(
            providerDelay == null
              ? exponentialDelay + jitter
              : Math.min(30_000, providerDelay * 1_000 + jitter),
          );
          continue;
        }
        if (status === 429)
          throw new AIProviderCapacityError(
            "RATE_LIMITED",
            retryAfterSeconds(error),
            model,
          );
        if (
          error instanceof GeminiTimeoutError ||
          retryableProviderError(error)
        )
          throw new AIProviderCapacityError(
            "PROVIDER_UNAVAILABLE",
            null,
            model,
          );
        if (error instanceof AIInvalidOutputError) throw error;
        throw new IntegrationError(
          "The Gemini provider request failed.",
          error,
        );
      }
    }
    throw new AIProviderCapacityError("PROVIDER_UNAVAILABLE", null, model);
  }

  private async consumeCapacity(model: string, tier: GeminiModelTier) {
    const limits = limitsForGeminiTier(this.config, tier);
    const day = await this.rateLimiter.consume(
      `gemini:${model}:daily`,
      "roleprowl-project",
      { limit: limits.rpd, windowMs: 86_400_000 },
    );
    if (!day.allowed)
      throw new AIProviderCapacityError(
        "LIMIT_REACHED",
        day.retryAfterSeconds,
        model,
      );
    const minute = await this.rateLimiter.consume(
      `gemini:${model}:minute`,
      "roleprowl-project",
      { limit: limits.rpm, windowMs: 60_000 },
    );
    if (!minute.allowed)
      throw new AIProviderCapacityError(
        "RATE_LIMITED",
        minute.retryAfterSeconds,
        model,
      );
    return day.remaining <= Math.max(1, Math.ceil(limits.rpd * 0.1)) ||
      minute.remaining <= Math.max(1, Math.ceil(limits.rpm * 0.1))
      ? "NEAR_LIMIT"
      : "AVAILABLE";
  }
}
