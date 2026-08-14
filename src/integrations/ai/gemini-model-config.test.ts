import { describe, expect, it } from "vitest";
import { AI_TASKS } from "@/core/contracts/ai-provider";
import { GEMINI_TASK_ROUTES, routeGeminiTask } from "./gemini-model-config";

describe("Gemini model routing", () => {
  it("routes routine tasks to Lite and difficult generation to Flash", () => {
    expect(Object.keys(GEMINI_TASK_ROUTES).sort()).toEqual(
      [...AI_TASKS].sort(),
    );
    for (const task of [
      "RESUME_FACT_EXTRACTION",
      "JOB_REQUIREMENT_NORMALIZATION",
      "SEMANTIC_EVIDENCE_COMPARISON",
      "APPLICATION_QUESTION_CLASSIFICATION",
      "FREE_TEXT_APPLICATION_GENERATION",
    ] as const) {
      expect(routeGeminiTask({ task }).preferredTier).toBe("LITE");
    }
    for (const task of [
      "RESUME_TAILORING",
      "COVER_LETTER_GENERATION",
    ] as const) {
      expect(routeGeminiTask({ task }).preferredTier).toBe("FLASH");
    }
  });

  it("permits an explicit difficult-task route without enabling fallback", () => {
    expect(
      routeGeminiTask({
        task: "FREE_TEXT_APPLICATION_GENERATION",
        modelPreference: "FLASH",
      }),
    ).toEqual({ preferredTier: "FLASH", allowFlashEscalation: false });
  });

  it("uses Flash escalation only for explicitly eligible Lite routes", () => {
    expect(
      routeGeminiTask({ task: "SEMANTIC_EVIDENCE_COMPARISON" })
        .allowFlashEscalation,
    ).toBe(true);
    expect(
      routeGeminiTask({ task: "APPLICATION_QUESTION_CLASSIFICATION" })
        .allowFlashEscalation,
    ).toBe(false);
    expect(
      routeGeminiTask({
        task: "APPLICATION_QUESTION_CLASSIFICATION",
        allowFlashEscalation: true,
      }).allowFlashEscalation,
    ).toBe(true);
  });
});
