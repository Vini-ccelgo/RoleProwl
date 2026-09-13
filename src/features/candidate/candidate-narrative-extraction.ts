import type { AIProvider } from "@/core/contracts/ai-provider";
import {
  isCandidateKnowledgeConcept,
  type CandidateKnowledgeConcept,
} from "@/core/domain/candidate/candidate-knowledge";
import { aiTaskDefinitions } from "@/features/ai/task-definitions";

export const MAX_CANDIDATE_NARRATIVE_CHARACTERS = 12_000;

export interface CandidateNarrativeProposalDraft {
  readonly concept: CandidateKnowledgeConcept;
  readonly confidence: number;
  readonly origin: "EXPLICIT" | "DERIVED";
  readonly proposedValue: Readonly<Record<string, unknown>>;
  readonly reusable: true;
  readonly supportingText: string;
}

export async function extractCandidateNarrativeProposals(input: {
  readonly ai: AIProvider;
  readonly allowedConcepts: readonly CandidateKnowledgeConcept[];
  readonly correlationId: string;
  readonly narrative: string;
  readonly userId: string;
}) {
  const narrative = input.narrative.trim();
  if (!narrative || narrative.length > MAX_CANDIDATE_NARRATIVE_CHARACTERS)
    throw new Error("Candidate narrative must contain 1 to 12,000 characters.");
  const definition = aiTaskDefinitions.CANDIDATE_NARRATIVE_EXTRACTION;
  const generated = await input.ai.generateStructured({
    task: "CANDIDATE_NARRATIVE_EXTRACTION",
    dataClassification: "REAL_CANDIDATE",
    correlationId: input.correlationId,
    rateLimitSubject: input.userId,
    promptVersion: definition.promptVersion,
    schemaName: definition.schemaName,
    schema: definition.schema,
    system: definition.system,
    modelPreference: "LITE",
    allowFlashEscalation: false,
    input: {
      candidateNarrative: narrative,
      allowedConcepts: input.allowedConcepts,
    },
  });
  const allowed = new Set(input.allowedConcepts);
  return generated.data.proposals.flatMap((proposal) => {
    if (
      !isCandidateKnowledgeConcept(proposal.concept) ||
      !allowed.has(proposal.concept) ||
      !narrative.includes(proposal.supportingText)
    )
      return [];
    return [
      {
        concept: proposal.concept,
        confidence: proposal.confidence,
        origin: proposal.origin,
        proposedValue: { text: proposal.value },
        reusable: true,
        supportingText: proposal.supportingText,
      } satisfies CandidateNarrativeProposalDraft,
    ];
  });
}
