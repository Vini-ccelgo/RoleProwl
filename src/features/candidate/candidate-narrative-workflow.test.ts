import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/core/contracts/ai-provider";
import { saveCandidateNarrativeWithOptionalExtraction } from "./candidate-narrative-workflow";

function repository() {
  return {
    create: vi.fn(async () => ({ id: "narrative-1" })),
    persistProposals: vi.fn(async () => ({ count: 1 })),
  };
}

describe("candidate narrative workflow", () => {
  it("saves candidate-owned narrative before a non-blocking AI failure", async () => {
    const repo = repository();
    const ai = vi.fn(() => {
      throw new Error("provider disabled");
    });
    await expect(
      saveCandidateNarrativeWithOptionalExtraction({
        ai,
        allowedConcepts: ["TARGET_ROLE"],
        content: "I want product security roles.",
        correlationId: "correlation-1",
        repository: repo,
        theme: "PROFESSIONAL_CONTEXT",
        userId: "candidate-a",
      }),
    ).resolves.toMatchObject({
      narrativeId: "narrative-1",
      extraction: "FAILED_NON_BLOCKING",
    });
    expect(repo.create).toHaveBeenCalledOnce();
    expect(repo.persistProposals).not.toHaveBeenCalled();
  });

  it("persists supported output as proposals and invokes only one selected provider", async () => {
    const repo = repository();
    const provider = {
      generateStructured: vi.fn(async () => ({
        data: {
          proposals: [
            {
              concept: "TARGET_ROLE",
              value: "Product security roles",
              supportingText: "I want product security roles",
              origin: "DERIVED",
              confidence: 0.9,
              approvalRequired: true,
            },
          ],
        },
        metadata: {},
      })),
    } as unknown as AIProvider;
    const ai = vi.fn(() => provider);
    await expect(
      saveCandidateNarrativeWithOptionalExtraction({
        ai,
        allowedConcepts: ["TARGET_ROLE"],
        content: "I want product security roles.",
        correlationId: "correlation-2",
        repository: repo,
        theme: "PROFESSIONAL_CONTEXT",
        userId: "candidate-a",
      }),
    ).resolves.toMatchObject({ extraction: "SUCCEEDED", proposalCount: 1 });
    expect(ai).toHaveBeenCalledOnce();
    expect(repo.persistProposals).toHaveBeenCalledWith(
      expect.objectContaining({
        narrativeId: "narrative-1",
        proposals: [expect.objectContaining({ concept: "TARGET_ROLE" })],
      }),
    );
  });
});
