import { describe, expect, it, vi } from "vitest";
import { DeterministicAIProvider } from "@/integrations/ai/deterministic-ai-provider";
import { classifyApplicationQuestion } from "./classify-application-question";

describe("hybrid application question classifier", () => {
  it("never lets AI override a deterministic safety classification", async () => {
    const resolver = vi.fn(() => ({
      classification: "PROFILE_FACT",
      confidence: 1,
      rationale: "unsafe override",
    }));
    const result = await classifyApplicationQuestion({
      ai: new DeterministicAIProvider(resolver),
      correlationId: "corr-classify-1",
      question: "Do you have a disability?",
      userId: "user-1",
    });
    expect(result.classification).toBe("SENSITIVE_PERSONAL_DATA");
    expect(result.source).toBe("DETERMINISTIC");
    expect(resolver).not.toHaveBeenCalled();
  });

  it("uses schema-constrained AI assistance only for an unknown question", async () => {
    const result = await classifyApplicationQuestion({
      ai: new DeterministicAIProvider((request) => {
        expect(request.task).toBe("APPLICATION_QUESTION_CLASSIFICATION");
        return {
          classification: "JOB_SPECIFIC_FREE_TEXT",
          confidence: 0.82,
          rationale: "Narrative response requested",
        };
      }),
      correlationId: "corr-classify-2",
      question: "Share the perspective you would bring to our design practice.",
      userId: "user-1",
    });
    expect(result).toMatchObject({
      classification: "JOB_SPECIFIC_FREE_TEXT",
      confidence: 0.82,
      source: "AI_ASSISTED",
    });
  });

  it("returns unknown without requiring an AI provider", async () => {
    await expect(
      classifyApplicationQuestion({
        correlationId: "corr-classify-3",
        question: "Unrecognized prompt form",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({ classification: "UNKNOWN" });
  });
});
