import { afterEach, describe, expect, it } from "vitest";
import { modelForTask, openAIRequestOptions } from "./openai-model-config";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("OpenAI model configuration", () => {
  it("supports a task override ahead of the shared default", () => {
    process.env.ROLEPROWL_AI_MODEL_DEFAULT = "default-model";
    process.env.ROLEPROWL_AI_MODEL_RESUME_TAILORING = "tailoring-model";
    expect(modelForTask("RESUME_TAILORING")).toBe("tailoring-model");
    expect(modelForTask("COVER_LETTER_GENERATION")).toBe("default-model");
  });

  it("provides bounded retry and timeout defaults", () => {
    delete process.env.ROLEPROWL_AI_TIMEOUT_MS;
    delete process.env.ROLEPROWL_AI_MAX_RETRIES;
    expect(openAIRequestOptions()).toEqual({ timeout: 30_000, maxRetries: 2 });
  });

  it("rejects invalid live request controls before creating the SDK client", () => {
    process.env.ROLEPROWL_AI_TIMEOUT_MS = "999999";
    expect(() => openAIRequestOptions()).toThrow();
    process.env.ROLEPROWL_AI_TIMEOUT_MS = "30000";
    process.env.ROLEPROWL_AI_MAX_RETRIES = "99";
    expect(() => openAIRequestOptions()).toThrow();
  });
});
