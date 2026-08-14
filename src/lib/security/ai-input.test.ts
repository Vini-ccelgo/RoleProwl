import { describe, expect, it } from "vitest";
import { ValidationError } from "@/core/errors/application-errors";
import {
  MAX_AI_INPUT_BYTES,
  serializeBoundedAIInput,
  validateAIRequestMetadata,
} from "./ai-input";

describe("AI request boundaries", () => {
  it("serializes bounded structured input", () => {
    expect(serializeBoundedAIInput({ evidence: ["supported"] })).toBe(
      '{"evidence":["supported"]}',
    );
  });

  it("rejects oversized and cyclic input before provider invocation", () => {
    expect(() =>
      serializeBoundedAIInput({ content: "x".repeat(MAX_AI_INPUT_BYTES + 1) }),
    ).toThrow(ValidationError);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => serializeBoundedAIInput(cyclic)).toThrow(ValidationError);
  });

  it("bounds provider metadata controlled by the application", () => {
    expect(() =>
      validateAIRequestMetadata({
        correlationId: "corr:123",
        rateLimitSubject: "user-1",
        schemaName: "tailored_resume",
        system: "Use only supplied evidence.",
      }),
    ).not.toThrow();
    expect(() =>
      validateAIRequestMetadata({
        correlationId: "contains spaces",
        rateLimitSubject: "user-1",
        schemaName: "tailored_resume",
        system: "Use only supplied evidence.",
      }),
    ).toThrow(ValidationError);
  });
});
