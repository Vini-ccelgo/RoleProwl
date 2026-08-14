import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConfigurationError } from "@/core/errors/application-errors";

const mocks = vi.hoisted(() => ({
  geminiGenerate: vi.fn(),
  googleConstructor: vi.fn(),
  openAIConstructor: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: function MockGoogleGenAI() {
    mocks.googleConstructor();
    return { models: { generateContent: mocks.geminiGenerate } };
  },
}));

vi.mock("openai", () => ({
  default: function MockOpenAI() {
    mocks.openAIConstructor();
    return { responses: { parse: vi.fn() } };
  },
}));

import { resolveAIProvider } from "./provider-factory";

afterEach(() => {
  vi.clearAllMocks();
});

describe("AI provider resolution", () => {
  it("selects Gemini without requiring or constructing OpenAI", () => {
    const provider = resolveAIProvider({
      environment: {
        AI_PROVIDER: "gemini",
        GEMINI_API_KEY: "synthetic-key-placeholder",
        ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
      },
    });
    expect(provider.constructor.name).toBe("GeminiAIProvider");
    expect(mocks.googleConstructor).toHaveBeenCalledOnce();
    expect(mocks.openAIConstructor).not.toHaveBeenCalled();
  });

  it("selects OpenAI without requiring a Gemini key", () => {
    const provider = resolveAIProvider({
      environment: {
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "openai-placeholder",
      },
    });
    expect(provider.constructor.name).toBe("OpenAIProvider");
    expect(mocks.openAIConstructor).toHaveBeenCalledOnce();
    expect(mocks.googleConstructor).not.toHaveBeenCalled();
  });

  it("selects deterministic only with an explicit fixture resolver", () => {
    const provider = resolveAIProvider({
      environment: { AI_PROVIDER: "deterministic" },
      deterministicResolver: () => ({ answer: "fixture" }),
    });
    expect(provider.constructor.name).toBe("DeterministicAIProvider");
    expect(mocks.openAIConstructor).not.toHaveBeenCalled();
    expect(mocks.googleConstructor).not.toHaveBeenCalled();
  });

  it("does not silently fall back when Gemini configuration is missing", () => {
    expect(() =>
      resolveAIProvider({ environment: { AI_PROVIDER: "gemini" } }),
    ).toThrow(ConfigurationError);
    expect(mocks.openAIConstructor).not.toHaveBeenCalled();
  });

  it("does not invoke OpenAI after a selected Gemini provider fails", async () => {
    const generateContent = vi.fn().mockRejectedValue(
      Object.assign(new Error("capacity"), {
        status: 429,
        retryAfterSeconds: 30,
      }),
    );
    const provider = resolveAIProvider({
      environment: {
        AI_PROVIDER: "gemini",
        GEMINI_API_KEY: "synthetic-key-placeholder",
        ROLEPROWL_AI_MAX_RETRIES: "0",
        ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
      },
      geminiClient: { generateContent },
      log: { log: vi.fn() },
      rateLimiter: {
        consume: vi.fn().mockResolvedValue({
          allowed: true,
          remaining: 100,
          retryAfterSeconds: 0,
        }),
      },
    });
    await expect(
      provider.generateStructured({
        correlationId: "no-paid-fallback",
        input: { fixture: "fictional" },
        promptVersion: "test-v1",
        rateLimitSubject: "synthetic-user",
        schema: z.object({ answer: z.string() }),
        schemaName: "test_answer",
        system: "Return fictional structured data.",
        task: "APPLICATION_QUESTION_CLASSIFICATION",
      }),
    ).rejects.toMatchObject({ state: "RATE_LIMITED" });
    expect(generateContent).toHaveBeenCalledOnce();
    expect(mocks.openAIConstructor).not.toHaveBeenCalled();
  });

  it("blocks synthetic-only Gemini in public production by default", () => {
    expect(() =>
      resolveAIProvider({
        environment: {
          AI_PROVIDER: "gemini",
          GEMINI_API_KEY: "synthetic-key-placeholder",
          ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
          ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "production",
        },
      }),
    ).toThrow("blocked in production");
    expect(mocks.googleConstructor).not.toHaveBeenCalled();
  });
});
