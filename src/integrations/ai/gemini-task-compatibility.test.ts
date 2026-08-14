import type { GenerateContentResponse } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import type { AITask } from "@/core/contracts/ai-provider";
import { aiTaskDefinitions } from "@/features/ai/task-definitions";
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

const outputs: Readonly<Record<AITask, unknown>> = {
  RESUME_FACT_EXTRACTION: { proposals: [] },
  JOB_REQUIREMENT_NORMALIZATION: {
    required: [],
    preferred: [],
    contradictions: [],
    unknowns: [],
  },
  SEMANTIC_EVIDENCE_COMPARISON: {
    supported: true,
    classification: "DIRECT_FACT",
    evidenceIds: ["synthetic-evidence-1"],
    explanation: "The fictional evidence directly supports the claim.",
  },
  APPLICATION_QUESTION_CLASSIFICATION: {
    classification: "JOB_SPECIFIC_FREE_TEXT",
    confidence: 0.91,
    rationale: "This asks for a role-specific narrative.",
  },
  FREE_TEXT_APPLICATION_GENERATION: {
    text: "A synthetic response grounded in the supplied fixture.",
    claims: [],
  },
  RESUME_TAILORING: {
    headline: "Synthetic Platform Engineer",
    summary: "A fictional candidate used only for manual alpha testing.",
    sections: [],
    claims: [],
  },
  COVER_LETTER_GENERATION: {
    subject: "Synthetic application",
    body: "This fictional candidate is applying in a controlled test.",
    claims: [],
  },
};

const expectedModel: Readonly<Record<AITask, string>> = {
  RESUME_FACT_EXTRACTION: config.liteModel,
  JOB_REQUIREMENT_NORMALIZATION: config.liteModel,
  SEMANTIC_EVIDENCE_COMPARISON: config.liteModel,
  APPLICATION_QUESTION_CLASSIFICATION: config.liteModel,
  FREE_TEXT_APPLICATION_GENERATION: config.liteModel,
  RESUME_TAILORING: config.flashModel,
  COVER_LETTER_GENERATION: config.flashModel,
};

describe("Gemini compatibility with RoleProwl task schemas", () => {
  for (const task of Object.keys(aiTaskDefinitions) as AITask[]) {
    it(`validates ${task} through its real schema`, async () => {
      const generateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(outputs[task]),
        responseId: `response-${task.toLowerCase()}`,
      } as unknown as GenerateContentResponse);
      const definition = aiTaskDefinitions[task];
      const result = await new GeminiAIProvider(
        { generateContent } as GeminiGenerateClient,
        config,
        { log: vi.fn() },
      ).generateStructured({
        correlationId: `fixture-${task.toLowerCase()}`,
        input: { fixture: "fictional-candidate-v1" },
        promptVersion: definition.promptVersion,
        rateLimitSubject: "synthetic-candidate",
        schema: definition.schema as ZodType<unknown>,
        schemaName: definition.schemaName,
        system: definition.system,
        task,
      });
      expect(result.data).toEqual(outputs[task]);
      expect(result.metadata.model).toBe(expectedModel[task]);
      expect(generateContent).toHaveBeenCalledTimes(1);
    });
  }
});
