import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AIInvalidOutputError } from "@/core/errors/application-errors";
import { DeterministicAIProvider } from "./deterministic-ai-provider";

const request = {
  correlationId: "corr-test-1",
  input: { privateValue: "candidate data" },
  promptVersion: "test-v1",
  rateLimitSubject: "user-1",
  schema: z.object({ answer: z.string() }),
  schemaName: "test_answer",
  system: "Return a test answer.",
  task: "FREE_TEXT_APPLICATION_GENERATION" as const,
};

describe("DeterministicAIProvider", () => {
  it("returns schema-validated fixture data with trace metadata", async () => {
    const provider = new DeterministicAIProvider(() => ({ answer: "fixture" }));
    await expect(provider.generateStructured(request)).resolves.toEqual({
      data: { answer: "fixture" },
      metadata: {
        capacityState: "AVAILABLE",
        correlationId: "corr-test-1",
        latencyMs: expect.any(Number),
        model: "deterministic-test-provider",
        provider: "deterministic",
        promptVersion: "test-v1",
        providerRequestId: null,
        retryCount: 0,
        schemaVersion: "test_answer",
        status: "SUCCEEDED",
        task: "FREE_TEXT_APPLICATION_GENERATION",
        usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      },
    });
  });

  it("rejects a fixture that violates the requested schema", async () => {
    const provider = new DeterministicAIProvider(() => ({ answer: 42 }));
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(
      AIInvalidOutputError,
    );
  });
});
