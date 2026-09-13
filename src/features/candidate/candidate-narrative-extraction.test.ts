import { describe, expect, it, vi } from "vitest";
import type {
  AIProvider,
  StructuredAIRequest,
} from "@/core/contracts/ai-provider";
import { extractCandidateNarrativeProposals } from "./candidate-narrative-extraction";

function provider(output: unknown) {
  const generateStructured = vi.fn(
    async (request: StructuredAIRequest<unknown>) => ({
      data: request.schema.parse(output),
      metadata: {},
    }),
  );
  return {
    ai: { generateStructured } as unknown as AIProvider,
    generateStructured,
  };
}

describe("candidate narrative extraction", () => {
  it("accepts only an allowed concept with exact candidate-authored support", async () => {
    const fake = provider({
      proposals: [
        {
          concept: "TARGET_ROLE",
          value: "Security engineering roles",
          supportingText: "I want security engineering roles",
          origin: "DERIVED",
          confidence: 0.9,
          approvalRequired: true,
        },
      ],
    });
    const result = await extractCandidateNarrativeProposals({
      ai: fake.ai,
      allowedConcepts: ["TARGET_ROLE"],
      correlationId: "correlation-1",
      narrative: "I want security engineering roles in product teams.",
      userId: "candidate-a",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      concept: "TARGET_ROLE",
      proposedValue: { text: "Security engineering roles" },
    });
    expect(fake.generateStructured.mock.calls[0][0]).toMatchObject({
      task: "CANDIDATE_NARRATIVE_EXTRACTION",
      dataClassification: "REAL_CANDIDATE",
      allowFlashEscalation: false,
      rateLimitSubject: "candidate-a",
      input: { allowedConcepts: ["TARGET_ROLE"] },
    });
  });

  it("drops unsupported or out-of-registry AI proposals", async () => {
    const fake = provider({
      proposals: [
        {
          concept: "CURRENT_COMPENSATION",
          value: "10000 BRL",
          supportingText: "not in the narrative",
          origin: "EXPLICIT",
          confidence: 0.9,
          approvalRequired: true,
        },
        {
          concept: "TARGET_ROLE",
          value: "Engineer",
          supportingText: "I want engineering",
          origin: "EXPLICIT",
          confidence: 0.9,
          approvalRequired: true,
        },
      ],
    });
    await expect(
      extractCandidateNarrativeProposals({
        ai: fake.ai,
        allowedConcepts: ["TARGET_ROLE"],
        correlationId: "correlation-2",
        narrative: "I want engineering work.",
        userId: "candidate-a",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        concept: "TARGET_ROLE",
        supportingText: "I want engineering",
      }),
    ]);
  });

  it("bounds candidate-authored input before making a provider call", async () => {
    const fake = provider({ proposals: [] });
    await expect(
      extractCandidateNarrativeProposals({
        ai: fake.ai,
        allowedConcepts: ["TARGET_ROLE"],
        correlationId: "correlation-3",
        narrative: "x".repeat(12_001),
        userId: "candidate-a",
      }),
    ).rejects.toThrow("1 to 12,000");
    expect(fake.generateStructured).not.toHaveBeenCalled();
  });
});
