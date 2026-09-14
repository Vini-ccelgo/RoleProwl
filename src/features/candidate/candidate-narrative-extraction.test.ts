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
  it("makes explicitly described language proficiency eligible without prior language evidence", async () => {
    const narrative =
      "I have professional fluency in English and intermediate Spanish.";
    const fake = provider({ proposals: [] });
    await extractCandidateNarrativeProposals({
      ai: fake.ai,
      allowedConcepts: [],
      correlationId: "correlation-languages",
      narrative,
      userId: "candidate-a",
    });
    expect(fake.generateStructured.mock.calls[0][0].input).toMatchObject({
      allowedConcepts: [
        "LANGUAGE_PROFICIENCY:english",
        "LANGUAGE_PROFICIENCY:spanish",
      ],
    });
  });

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
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
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
    ).resolves.toMatchObject({
      generatedCount: 2,
      proposals: [
        expect.objectContaining({
          concept: "TARGET_ROLE",
          supportingText: "I want engineering",
        }),
      ],
    });
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

  it("does not allow jurisdiction-free sponsorship or borrow candidate location", async () => {
    const fake = provider({
      proposals: [
        {
          concept: "SPONSORSHIP_REQUIREMENT:BR",
          value: "Not required",
          supportingText: "I do not need sponsorship",
          origin: "EXPLICIT",
          confidence: 0.9,
          approvalRequired: true,
        },
      ],
    });
    const result = await extractCandidateNarrativeProposals({
      ai: fake.ai,
      allowedConcepts: [],
      correlationId: "correlation-generic",
      narrative: "I live in Brazil. I do not need sponsorship.",
      userId: "candidate-a",
    });
    expect(result.proposals).toEqual([]);
    expect(fake.generateStructured.mock.calls[0][0].input).toEqual({
      candidateNarrative: "I live in Brazil. I do not need sponsorship.",
      allowedConcepts: [],
    });
  });

  it("allows Brazil concepts only when the narrative explicitly binds facts to Brazil", async () => {
    const narrative =
      "I am authorized to work in Brazil and do not require sponsorship there.";
    const fake = provider({
      proposals: [
        {
          concept: "WORK_AUTHORIZATION:BR",
          value: "Authorized",
          supportingText: "authorized to work in Brazil",
          origin: "EXPLICIT",
          confidence: 0.95,
          approvalRequired: true,
        },
        {
          concept: "SPONSORSHIP_REQUIREMENT:BR",
          value: "Not required",
          supportingText: "do not require sponsorship there",
          origin: "EXPLICIT",
          confidence: 0.95,
          approvalRequired: true,
        },
      ],
    });
    const result = await extractCandidateNarrativeProposals({
      ai: fake.ai,
      allowedConcepts: [],
      correlationId: "correlation-br",
      narrative,
      userId: "candidate-a",
    });
    expect(result.proposals.map((proposal) => proposal.concept)).toEqual([
      "WORK_AUTHORIZATION:BR",
      "SPONSORSHIP_REQUIREMENT:BR",
    ]);
    expect(fake.generateStructured.mock.calls[0][0].input).toMatchObject({
      allowedConcepts: ["WORK_AUTHORIZATION:BR", "SPONSORSHIP_REQUIREMENT:BR"],
    });
  });
});
