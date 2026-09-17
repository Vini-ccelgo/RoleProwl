import type { ApplicationQuestionResolution } from "./application-question-resolution";

export interface CandidateInterventionMetric {
  readonly totalEmployerSemanticDecisions: number;
  readonly automaticallyResolved: number;
  readonly oneClickProposals: number;
  readonly candidateEnteredAnswers: number;
  readonly employerSiteIrreducibleSteps: number;
}

export function candidateInterventionMetric(
  resolutions: readonly ApplicationQuestionResolution[],
): CandidateInterventionMetric {
  return {
    totalEmployerSemanticDecisions: resolutions.length,
    automaticallyResolved: resolutions.filter(
      (item) => item.disposition === "AUTO_RESOLVED",
    ).length,
    oneClickProposals: resolutions.filter(
      (item) => item.disposition === "PROPOSED_FOR_CANDIDATE",
    ).length,
    candidateEnteredAnswers: resolutions.filter(
      (item) => item.disposition === "CANDIDATE_REQUIRED",
    ).length,
    employerSiteIrreducibleSteps: resolutions.filter(
      (item) =>
        item.disposition === "HUMAN_REQUIRED" ||
        item.disposition === "UNSUPPORTED",
    ).length,
  };
}
