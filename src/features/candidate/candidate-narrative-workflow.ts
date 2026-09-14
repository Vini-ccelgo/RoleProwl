import type { AIProvider } from "@/core/contracts/ai-provider";
import {
  AIDataPolicyError,
  AIInvalidOutputError,
  ConfigurationError,
} from "@/core/errors/application-errors";
import type { CandidateKnowledgeConcept } from "@/core/domain/candidate/candidate-knowledge";
import type { Logger } from "@/lib/logging/logger";
import { logger } from "@/lib/logging/logger";
import {
  candidateNarrativeEligibleConcepts,
  extractCandidateNarrativeProposals,
  type CandidateNarrativeProposalDraft,
} from "./candidate-narrative-extraction";

export type CandidateNarrativeExtractionOutcome =
  | "PROPOSALS_CREATED"
  | "NO_ELIGIBLE_CONCEPTS"
  | "PROVIDER_DISABLED"
  | "POLICY_BLOCKED"
  | "PROVIDER_FAILED"
  | "INVALID_PROVIDER_OUTPUT"
  | "NO_SUPPORTED_PROPOSALS"
  | "PROPOSAL_PERSISTENCE_FAILED";

export function candidateNarrativeOutcomeMessage(result: {
  readonly extraction: CandidateNarrativeExtractionOutcome;
  readonly proposalCount: number;
}) {
  if (result.extraction === "PROPOSALS_CREATED")
    return `Your answer is saved. ${result.proposalCount} reusable detail${result.proposalCount === 1 ? " is" : "s are"} ready for review.`;
  if (
    result.extraction === "NO_ELIGIBLE_CONCEPTS" ||
    result.extraction === "NO_SUPPORTED_PROPOSALS"
  )
    return "Your answer is saved. No new reusable details were identified.";
  return "Your answer is saved. Automatic organization is unavailable right now; you can still manage details manually.";
}

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
  readonly knownConcepts?: readonly CandidateKnowledgeConcept[];
  readonly repository: CandidateNarrativeWorkflowRepository;
  readonly theme:
    "PROFESSIONAL_CONTEXT" | "RECURRING_DETAILS" | "RECURRING_PREFERENCES";
  readonly userId: string;
  readonly log?: Logger;
}) {
  const startedAt = Date.now();
  const log = input.log ?? logger;
  const emit = (details: {
    outcome: CandidateNarrativeExtractionOutcome;
    reason: string;
    proposalCount?: number;
    provider?: string;
    model?: string;
    retryCount?: number;
  }) => {
    log.log(
      details.outcome === "PROPOSALS_CREATED" ||
        details.outcome === "NO_ELIGIBLE_CONCEPTS" ||
        details.outcome === "NO_SUPPORTED_PROPOSALS"
        ? "info"
        : "warn",
      "ai_task_outcome",
      {
        task: "CANDIDATE_NARRATIVE_EXTRACTION",
        correlationId: input.correlationId,
        status: details.outcome,
        reason: details.reason,
        conceptCount: eligibleConcepts.length,
        proposalCount: details.proposalCount ?? 0,
        provider: details.provider,
        model: details.model,
        latencyMs: Date.now() - startedAt,
        retryCount: details.retryCount ?? 0,
      },
    );
  };
  const narrative = await input.repository.create({
    userId: input.userId,
    theme: input.theme,
    content: input.content,
  });
  const eligibleConcepts = candidateNarrativeEligibleConcepts({
    allowedConcepts: input.allowedConcepts,
    knownConcepts: input.knownConcepts,
    narrative: input.content,
  });
  if (eligibleConcepts.length === 0) {
    emit({
      outcome: "NO_ELIGIBLE_CONCEPTS",
      reason: "NO_MISSING_OR_EXPLICIT_DYNAMIC_CONCEPTS",
    });
    return {
      narrativeId: narrative.id,
      extraction: "NO_ELIGIBLE_CONCEPTS" as const,
      proposalCount: 0,
    };
  }
  let ai: AIProvider;
  try {
    ai = input.ai();
  } catch (error) {
    const extraction =
      error instanceof ConfigurationError
        ? ("PROVIDER_DISABLED" as const)
        : ("PROVIDER_FAILED" as const);
    emit({
      outcome: extraction,
      reason:
        extraction === "PROVIDER_DISABLED"
          ? "PROVIDER_CONFIGURATION_UNAVAILABLE"
          : "PROVIDER_CONSTRUCTION_FAILED",
    });
    return { narrativeId: narrative.id, extraction, proposalCount: 0 };
  }
  let extracted: Awaited<ReturnType<typeof extractCandidateNarrativeProposals>>;
  try {
    extracted = await extractCandidateNarrativeProposals({
      ai,
      allowedConcepts: eligibleConcepts,
      correlationId: input.correlationId,
      knownConcepts: input.knownConcepts,
      narrative: input.content,
      userId: input.userId,
    });
  } catch (error) {
    const extraction =
      error instanceof AIDataPolicyError
        ? ("POLICY_BLOCKED" as const)
        : error instanceof AIInvalidOutputError
          ? ("INVALID_PROVIDER_OUTPUT" as const)
          : ("PROVIDER_FAILED" as const);
    emit({
      outcome: extraction,
      reason:
        extraction === "POLICY_BLOCKED"
          ? "REAL_CANDIDATE_DATA_POLICY_BLOCKED"
          : extraction === "INVALID_PROVIDER_OUTPUT"
            ? "STRUCTURED_OUTPUT_INVALID"
            : "PROVIDER_REQUEST_FAILED",
    });
    return { narrativeId: narrative.id, extraction, proposalCount: 0 };
  }
  if (extracted.proposals.length === 0) {
    emit({
      outcome: "NO_SUPPORTED_PROPOSALS",
      reason:
        extracted.generatedCount === 0
          ? "PROVIDER_RETURNED_NO_PROPOSALS"
          : "ALL_PROPOSALS_REJECTED",
      provider: extracted.metadata.provider,
      model: extracted.metadata.model,
      retryCount: extracted.metadata.retryCount,
    });
    return {
      narrativeId: narrative.id,
      extraction: "NO_SUPPORTED_PROPOSALS" as const,
      proposalCount: 0,
    };
  }
  try {
    await input.repository.persistProposals({
      userId: input.userId,
      narrativeId: narrative.id,
      proposals: extracted.proposals,
    });
    emit({
      outcome: "PROPOSALS_CREATED",
      reason: "SUPPORTED_PROPOSALS_PERSISTED",
      proposalCount: extracted.proposals.length,
      provider: extracted.metadata.provider,
      model: extracted.metadata.model,
      retryCount: extracted.metadata.retryCount,
    });
    return {
      narrativeId: narrative.id,
      extraction: "PROPOSALS_CREATED" as const,
      proposalCount: extracted.proposals.length,
    };
  } catch {
    emit({
      outcome: "PROPOSAL_PERSISTENCE_FAILED",
      reason: "PROPOSAL_PERSISTENCE_FAILED",
      provider: extracted.metadata.provider,
      model: extracted.metadata.model,
      retryCount: extracted.metadata.retryCount,
    });
    return {
      narrativeId: narrative.id,
      extraction: "PROPOSAL_PERSISTENCE_FAILED" as const,
      proposalCount: 0,
    };
  }
}
