import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/core/contracts/ai-provider";
import {
  AIDataPolicyError,
  AIInvalidOutputError,
  AIProviderCapacityError,
  ConfigurationError,
} from "@/core/errors/application-errors";
import type { Logger } from "@/lib/logging/logger";
import {
  candidateNarrativeOutcomeMessage,
  saveCandidateNarrativeWithOptionalExtraction,
} from "./candidate-narrative-workflow";

const narrative = "I want product security roles.";

function repository() {
  return {
    create: vi.fn(async () => ({ id: "narrative-1" })),
    persistProposals: vi.fn(async () => ({ count: 1 })),
  };
}

function log() {
  return { log: vi.fn() } as unknown as Logger & {
    log: ReturnType<typeof vi.fn>;
  };
}

function provider(output?: unknown, failure?: Error) {
  const generateStructured = vi.fn(async () => {
    if (failure) throw failure;
    return {
      data: output ?? {
        proposals: [
          {
            concept: "TARGET_ROLE",
            value: "Product security roles",
            supportingText: "product security roles",
            origin: "DERIVED",
            confidence: 0.9,
            approvalRequired: true,
          },
        ],
      },
      metadata: {
        provider: "gemini",
        model: "gemini-test",
        retryCount: 0,
      },
    };
  });
  return {
    ai: { generateStructured } as unknown as AIProvider,
    generateStructured,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    ai: () => provider().ai,
    allowedConcepts: ["TARGET_ROLE"] as const,
    content: narrative,
    correlationId: "correlation-1",
    repository: repository(),
    theme: "PROFESSIONAL_CONTEXT" as const,
    userId: "candidate-a",
    log: log(),
    ...overrides,
  };
}

describe("candidate narrative workflow", () => {
  it("maps every bounded outcome to truthful candidate-facing status", () => {
    expect(
      candidateNarrativeOutcomeMessage({
        extraction: "PROPOSALS_CREATED",
        proposalCount: 2,
      }),
    ).toBe("Your answer is saved. 2 reusable details are ready for review.");
    expect(
      candidateNarrativeOutcomeMessage({
        extraction: "NO_ELIGIBLE_CONCEPTS",
        proposalCount: 0,
      }),
    ).toContain("No new reusable details were identified");
    expect(
      candidateNarrativeOutcomeMessage({
        extraction: "POLICY_BLOCKED",
        proposalCount: 0,
      }),
    ).toContain("Automatic organization is unavailable right now");
  });
  it("persists a new narrative before one eligible extraction attempt", async () => {
    const order: string[] = [];
    const repo = repository();
    repo.create.mockImplementation(async () => {
      order.push("narrative");
      return { id: "narrative-1" };
    });
    const fake = provider();
    fake.generateStructured.mockImplementation(async () => {
      order.push("provider");
      return provider().generateStructured();
    });
    const result = await saveCandidateNarrativeWithOptionalExtraction(
      input({ ai: () => fake.ai, repository: repo }),
    );
    expect(order).toEqual(["narrative", "provider"]);
    expect(fake.generateStructured).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      extraction: "PROPOSALS_CREATED",
      proposalCount: 1,
    });
    expect(repo.persistProposals).toHaveBeenCalledWith(
      expect.objectContaining({
        narrativeId: "narrative-1",
        proposals: [expect.objectContaining({ concept: "TARGET_ROLE" })],
      }),
    );
  });

  it("runs the same extraction path for an updated narrative version", async () => {
    const repo = repository();
    repo.create.mockResolvedValue({ id: "narrative-updated" });
    const fake = provider();
    const result = await saveCandidateNarrativeWithOptionalExtraction(
      input({
        ai: () => fake.ai,
        content: "I now want product security roles.",
        repository: repo,
      }),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "I now want product security roles.",
      }),
    );
    expect(fake.generateStructured).toHaveBeenCalledOnce();
    expect(repo.persistProposals).toHaveBeenCalledWith(
      expect.objectContaining({ narrativeId: "narrative-updated" }),
    );
    expect(result.extraction).toBe("PROPOSALS_CREATED");
  });

  it("skips the provider with an explicit outcome when no concepts are eligible", async () => {
    const repo = repository();
    const ai = vi.fn(() => provider().ai);
    const logger = log();
    const result = await saveCandidateNarrativeWithOptionalExtraction(
      input({ ai, allowedConcepts: [], repository: repo, log: logger }),
    );
    expect(result.extraction).toBe("NO_ELIGIBLE_CONCEPTS");
    expect(ai).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(
      "info",
      "ai_task_outcome",
      expect.objectContaining({
        task: "CANDIDATE_NARRATIVE_EXTRACTION",
        status: "NO_ELIGIBLE_CONCEPTS",
        reason: "NO_MISSING_OR_EXPLICIT_DYNAMIC_CONCEPTS",
      }),
    );
  });

  it("does not reprocess an explicitly named dynamic concept that is already known", async () => {
    const repo = repository();
    const ai = vi.fn(() => provider().ai);
    const result = await saveCandidateNarrativeWithOptionalExtraction(
      input({
        ai,
        allowedConcepts: [],
        content: "I have professional fluency in English.",
        knownConcepts: ["LANGUAGE_PROFICIENCY:english"],
        repository: repo,
      }),
    );
    expect(result.extraction).toBe("NO_ELIGIBLE_CONCEPTS");
    expect(ai).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it("preserves the narrative and identifies a disabled provider", async () => {
    const repo = repository();
    const result = await saveCandidateNarrativeWithOptionalExtraction(
      input({
        ai: () => {
          throw new ConfigurationError("provider disabled");
        },
        repository: repo,
      }),
    );
    expect(repo.create).toHaveBeenCalledOnce();
    expect(repo.persistProposals).not.toHaveBeenCalled();
    expect(result.extraction).toBe("PROVIDER_DISABLED");
  });

  it("preserves the narrative and reports a real-data policy block", async () => {
    const repo = repository();
    const fake = provider(
      undefined,
      new AIDataPolicyError("real candidate data blocked"),
    );
    const result = await saveCandidateNarrativeWithOptionalExtraction(
      input({ ai: () => fake.ai, repository: repo }),
    );
    expect(repo.create).toHaveBeenCalledOnce();
    expect(repo.persistProposals).not.toHaveBeenCalled();
    expect(result.extraction).toBe("POLICY_BLOCKED");
  });

  it.each([
    new Error("timeout"),
    new AIProviderCapacityError("RATE_LIMITED", 30, "gemini-test"),
  ])("preserves the narrative for provider failure %#", async (failure) => {
    const repo = repository();
    const fake = provider(undefined, failure);
    const result = await saveCandidateNarrativeWithOptionalExtraction(
      input({ ai: () => fake.ai, repository: repo }),
    );
    expect(result.extraction).toBe("PROVIDER_FAILED");
    expect(repo.create).toHaveBeenCalledOnce();
    expect(repo.persistProposals).not.toHaveBeenCalled();
  });

  it("classifies invalid structured output without creating knowledge", async () => {
    const repo = repository();
    const fake = provider(
      undefined,
      new AIInvalidOutputError("schema invalid"),
    );
    const result = await saveCandidateNarrativeWithOptionalExtraction(
      input({ ai: () => fake.ai, repository: repo }),
    );
    expect(result.extraction).toBe("INVALID_PROVIDER_OUTPUT");
    expect(repo.persistProposals).not.toHaveBeenCalled();
  });

  it("reports when every schema-valid proposal fails support checks", async () => {
    const repo = repository();
    const fake = provider({
      proposals: [
        {
          concept: "TARGET_ROLE",
          value: "Executive security leader",
          supportingText: "not candidate-authored",
          origin: "DERIVED",
          confidence: 0.9,
          approvalRequired: true,
        },
      ],
    });
    const logger = log();
    const result = await saveCandidateNarrativeWithOptionalExtraction(
      input({ ai: () => fake.ai, repository: repo, log: logger }),
    );
    expect(result.extraction).toBe("NO_SUPPORTED_PROPOSALS");
    expect(repo.persistProposals).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "info",
      "ai_task_outcome",
      expect.objectContaining({
        task: "CANDIDATE_NARRATIVE_EXTRACTION",
        status: "NO_SUPPORTED_PROPOSALS",
        reason: "ALL_PROPOSALS_REJECTED",
        conceptCount: 1,
        proposalCount: 0,
        provider: "gemini",
        model: "gemini-test",
        latencyMs: expect.any(Number),
        retryCount: 0,
      }),
    );
    const serialized = JSON.stringify(logger.log.mock.calls);
    expect(serialized).toContain("ALL_PROPOSALS_REJECTED");
    expect(serialized).not.toContain(narrative);
    expect(serialized).not.toContain("Executive security leader");
  });
});
