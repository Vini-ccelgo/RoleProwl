import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AIInvalidOutputError,
  AIRefusalError,
  ValidationError,
} from "@/core/errors/application-errors";
import type { RateLimiter } from "@/core/contracts/rate-limiter";
import type { Logger } from "@/lib/logging/logger";
import { OpenAIProvider } from "./openai-provider";

const request = {
  correlationId: "corr-42",
  input: { candidateName: "Private Person", evidence: ["private evidence"] },
  promptVersion: "test-v1",
  rateLimitSubject: "user-1",
  schema: z.object({ answer: z.string() }),
  schemaName: "test_answer",
  system: "Return only a supported answer.",
  task: "FREE_TEXT_APPLICATION_GENERATION" as const,
};

function clientReturning(response: unknown) {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { responses: { parse } } as unknown as OpenAI, parse };
}

describe("OpenAIProvider", () => {
  it("uses Responses structured parsing and returns trace metadata", async () => {
    const { client, parse } = clientReturning({
      _request_id: "req_123",
      output: [],
      output_parsed: { answer: "Supported answer" },
      usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
    });
    const log: Logger = { log: vi.fn() };
    const result = await new OpenAIProvider(client, log).generateStructured(
      request,
    );

    expect(result.data).toEqual({ answer: "Supported answer" });
    expect(result.metadata).toMatchObject({
      correlationId: "corr-42",
      providerRequestId: "req_123",
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    });
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          { role: "system", content: request.system },
          { role: "user", content: JSON.stringify(request.input) },
        ],
        metadata: expect.objectContaining({ correlation_id: "corr-42" }),
      }),
    );
    const serializedLogs = JSON.stringify(vi.mocked(log.log).mock.calls);
    expect(serializedLogs).not.toContain("Private Person");
    expect(serializedLogs).not.toContain("private evidence");
  });

  it("surfaces a provider refusal distinctly", async () => {
    const { client } = clientReturning({
      output: [{ content: [{ type: "refusal", refusal: "Cannot comply" }] }],
      output_parsed: null,
    });
    await expect(
      new OpenAIProvider(client, { log: vi.fn() }).generateStructured(request),
    ).rejects.toBeInstanceOf(AIRefusalError);
  });

  it("rejects absent schema-valid output", async () => {
    const { client } = clientReturning({ output: [], output_parsed: null });
    await expect(
      new OpenAIProvider(client, { log: vi.fn() }).generateStructured(request),
    ).rejects.toBeInstanceOf(AIInvalidOutputError);
  });

  it("rejects oversized input before invoking the provider", async () => {
    const { client, parse } = clientReturning({});
    await expect(
      new OpenAIProvider(client, { log: vi.fn() }).generateStructured({
        ...request,
        input: { content: "x".repeat(110_000) },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(parse).not.toHaveBeenCalled();
  });

  it("enforces the actor-scoped AI rate limit before invoking the provider", async () => {
    const { client, parse } = clientReturning({});
    const limiter: RateLimiter = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 37,
      }),
    };
    await expect(
      new OpenAIProvider(client, { log: vi.fn() }, limiter).generateStructured(
        request,
      ),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 37,
    });
    expect(limiter.consume).toHaveBeenCalledWith(
      "openai-structured-task",
      "user-1",
      { limit: 30, windowMs: 60_000 },
    );
    expect(parse).not.toHaveBeenCalled();
  });
});
