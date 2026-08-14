import type { GenerateContentResponse } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { RateLimiter } from "@/core/contracts/rate-limiter";
import {
  AIInvalidOutputError,
  AIProviderCapacityError,
  AIRefusalError,
} from "@/core/errors/application-errors";
import type { Logger } from "@/lib/logging/logger";
import type { GeminiRuntimeConfig } from "./gemini-model-config";
import { GeminiAIProvider, type GeminiGenerateClient } from "./gemini-provider";

const config: GeminiRuntimeConfig = {
  liteModel: "gemini-3.5-flash-lite",
  flashModel: "gemini-3.5-flash",
  liteRpmLimit: 12,
  liteRpdLimit: 450,
  flashRpmLimit: 4,
  flashRpdLimit: 15,
  maxRetries: 0,
  timeoutMs: 1_000,
};

const request = {
  correlationId: "corr-gemini-1",
  input: { fictionalCandidate: "Synthetic Person" },
  promptVersion: "test-v1",
  rateLimitSubject: "synthetic-user",
  schema: z.object({ answer: z.string() }),
  schemaName: "test_answer",
  system: "Return a schema-valid synthetic answer.",
  task: "APPLICATION_QUESTION_CLASSIFICATION" as const,
};

function response(value: unknown, extra: Record<string, unknown> = {}) {
  return {
    text: JSON.stringify(value),
    responseId: "gemini-response-1",
    usageMetadata: {
      promptTokenCount: 20,
      candidatesTokenCount: 5,
      totalTokenCount: 25,
    },
    ...extra,
  } as unknown as GenerateContentResponse;
}

function clientWith(...values: unknown[]) {
  const generateContent = vi.fn();
  for (const value of values) {
    if (value instanceof Error) generateContent.mockRejectedValueOnce(value);
    else generateContent.mockResolvedValueOnce(value);
  }
  return {
    client: { generateContent } as GeminiGenerateClient,
    generateContent,
  };
}

const allow: RateLimiter = {
  consume: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 100,
    retryAfterSeconds: 0,
  }),
};

describe("GeminiAIProvider", () => {
  it("returns validated structured output and normalized safe metadata", async () => {
    const { client, generateContent } = clientWith(
      response({ answer: "Synthetic answer" }),
    );
    const log: Logger = { log: vi.fn() };
    const result = await new GeminiAIProvider(
      client,
      config,
      log,
      allow,
    ).generateStructured(request);

    expect(result).toMatchObject({
      data: { answer: "Synthetic answer" },
      metadata: {
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
        providerRequestId: "gemini-response-1",
        schemaVersion: "test_answer",
        status: "SUCCEEDED",
        retryCount: 0,
        usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
      },
    });
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3.5-flash-lite",
        contents: JSON.stringify(request.input),
        config: expect.objectContaining({
          responseMimeType: "application/json",
          responseJsonSchema: expect.objectContaining({ type: "object" }),
          systemInstruction: request.system,
        }),
      }),
    );
    const logs = JSON.stringify(vi.mocked(log.log).mock.calls);
    expect(logs).not.toContain("Synthetic Person");
    expect(logs).not.toContain(request.system);
  });

  it("rejects output that violates the RoleProwl schema", async () => {
    const { client } = clientWith(response({ answer: 42 }));
    await expect(
      new GeminiAIProvider(client, config).generateStructured(request),
    ).rejects.toBeInstanceOf(AIInvalidOutputError);
  });

  it("surfaces provider refusal distinctly", async () => {
    const { client } = clientWith(
      response({}, { promptFeedback: { blockReason: "SAFETY" } }),
    );
    await expect(
      new GeminiAIProvider(client, config).generateStructured(request),
    ).rejects.toBeInstanceOf(AIRefusalError);
  });

  it("bounds a timed-out request", async () => {
    const generateContent = vi.fn(() => new Promise(() => undefined));
    await expect(
      new GeminiAIProvider({ generateContent } as GeminiGenerateClient, {
        ...config,
        timeoutMs: 5,
      }).generateStructured(request),
    ).rejects.toMatchObject({
      code: "AI_CAPACITY",
      state: "PROVIDER_UNAVAILABLE",
    });
  });

  it("classifies exhausted provider 429 responses without raw errors", async () => {
    const error = Object.assign(new Error("raw Google capacity details"), {
      status: 429,
      retryAfterSeconds: 17,
    });
    const { client } = clientWith(error);
    await expect(
      new GeminiAIProvider(client, config).generateStructured(request),
    ).rejects.toMatchObject({
      code: "AI_CAPACITY",
      state: "RATE_LIMITED",
      retryAfterSeconds: 17,
      message:
        "AI capacity is temporarily unavailable. The task can be retried later.",
    });
  });

  it("retries a 429 with bounded provider-directed backoff", async () => {
    const error = Object.assign(new Error("capacity"), {
      status: 429,
      retryAfterSeconds: 2,
    });
    const { client, generateContent } = clientWith(
      error,
      response({ answer: "Recovered" }),
    );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await new GeminiAIProvider(
      client,
      { ...config, maxRetries: 1 },
      { log: vi.fn() },
      allow,
      { random: () => 0, sleep },
    ).generateStructured(request);
    expect(result.data).toEqual({ answer: "Recovered" });
    expect(result.metadata.retryCount).toBe(1);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("classifies an exhausted provider 5xx as unavailable", async () => {
    const { client } = clientWith(
      Object.assign(new Error("internal provider detail"), { status: 503 }),
    );
    await expect(
      new GeminiAIProvider(client, config).generateStructured(request),
    ).rejects.toMatchObject({
      code: "AI_CAPACITY",
      state: "PROVIDER_UNAVAILABLE",
    });
  });

  it("rejects a response with no expected payload", async () => {
    const { client } = clientWith({ responseId: "empty" });
    await expect(
      new GeminiAIProvider(client, config).generateStructured(request),
    ).rejects.toBeInstanceOf(AIInvalidOutputError);
  });

  it("rejects malformed JSON before RoleProwl domain use", async () => {
    const { client } = clientWith({ text: "{not-json" });
    await expect(
      new GeminiAIProvider(client, config).generateStructured(request),
    ).rejects.toBeInstanceOf(AIInvalidOutputError);
  });

  it("stops before the SDK call when the daily ceiling is reached", async () => {
    const { client, generateContent } = clientWith(
      response({ answer: "must not run" }),
    );
    const limiter: RateLimiter = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 3_600,
      }),
    };
    await expect(
      new GeminiAIProvider(
        client,
        config,
        { log: vi.fn() },
        limiter,
      ).generateStructured(request),
    ).rejects.toMatchObject({
      code: "AI_CAPACITY",
      state: "LIMIT_REACHED",
      retryAfterSeconds: 3_600,
    });
    expect(generateContent).not.toHaveBeenCalled();
    expect(limiter.consume).toHaveBeenCalledWith(
      "gemini:gemini-3.5-flash-lite:daily",
      "roleprowl-project",
      { limit: 450, windowMs: 86_400_000 },
    );
  });

  it("escalates an eligible Lite schema failure to Flash once", async () => {
    const { client, generateContent } = clientWith(
      response({ answer: 42 }),
      response({ answer: 42 }),
      response({ answer: "Flash recovery" }),
    );
    const result = await new GeminiAIProvider(
      client,
      { ...config, maxRetries: 1 },
      { log: vi.fn() },
      allow,
      { random: () => 0, sleep: vi.fn().mockResolvedValue(undefined) },
    ).generateStructured({
      ...request,
      task: "SEMANTIC_EVIDENCE_COMPARISON",
    });
    expect(result.data).toEqual({ answer: "Flash recovery" });
    expect(result.metadata.model).toBe("gemini-3.5-flash");
    expect(generateContent.mock.calls.map(([input]) => input.model)).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
    ]);
  });

  it("fails safely when Flash escalation has no daily capacity", async () => {
    const { client, generateContent } = clientWith(response({ answer: 42 }));
    const consume = vi
      .fn()
      .mockResolvedValueOnce({
        allowed: true,
        remaining: 400,
        retryAfterSeconds: 0,
      })
      .mockResolvedValueOnce({
        allowed: true,
        remaining: 10,
        retryAfterSeconds: 0,
      })
      .mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 43_200,
      });
    await expect(
      new GeminiAIProvider(
        client,
        config,
        { log: vi.fn() },
        { consume },
      ).generateStructured({
        ...request,
        task: "SEMANTIC_EVIDENCE_COMPARISON",
      }),
    ).rejects.toBeInstanceOf(AIProviderCapacityError);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenLastCalledWith(
      "gemini:gemini-3.5-flash:daily",
      "roleprowl-project",
      { limit: 15, windowMs: 86_400_000 },
    );
  });
});
