import type { AIProvider } from "@/core/contracts/ai-provider";
import type { CandidateKnowledgeConcept } from "@/core/domain/candidate/candidate-knowledge";
import {
  extractCandidateNarrativeProposals,
  type CandidateNarrativeProposalDraft,
} from "./candidate-narrative-extraction";

export interface CandidateNarrativeWorkflowRepository {
  create(input: {
    readonly content: string;
    readonly theme:
      "PROFESSIONAL_CONTEXT" | "RECURRING_DETAILS" | "RECURRING_PREFERENCES";
    readonly userId: string;
  }): Promise<{ readonly id: string }>;
  persistProposals(input: {
    readonly narrativeId: string;
    readonly proposals: readonly CandidateNarrativeProposalDraft[];
    readonly userId: string;
  }): Promise<unknown>;
}

export async function saveCandidateNarrativeWithOptionalExtraction(input: {
  readonly ai: () => AIProvider;
  readonly allowedConcepts: readonly CandidateKnowledgeConcept[];
  readonly content: string;
  readonly correlationId: string;
  readonly repository: CandidateNarrativeWorkflowRepository;
  readonly theme:
    "PROFESSIONAL_CONTEXT" | "RECURRING_DETAILS" | "RECURRING_PREFERENCES";
  readonly userId: string;
}) {
  const narrative = await input.repository.create({
    userId: input.userId,
    theme: input.theme,
    content: input.content,
  });
  if (input.allowedConcepts.length === 0)
    return {
      narrativeId: narrative.id,
      extraction: "NOT_NEEDED" as const,
      proposalCount: 0,
    };
  try {
    const proposals = await extractCandidateNarrativeProposals({
      ai: input.ai(),
      allowedConcepts: input.allowedConcepts,
      correlationId: input.correlationId,
      narrative: input.content,
      userId: input.userId,
    });
    await input.repository.persistProposals({
      userId: input.userId,
      narrativeId: narrative.id,
      proposals,
    });
    return {
      narrativeId: narrative.id,
      extraction: "SUCCEEDED" as const,
      proposalCount: proposals.length,
    };
  } catch {
    return {
      narrativeId: narrative.id,
      extraction: "FAILED_NON_BLOCKING" as const,
      proposalCount: 0,
    };
  }
}
