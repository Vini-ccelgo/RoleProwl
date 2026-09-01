import {
  MATCH_SCORING_VERSION,
  MINIMUM_HIGH_FIT_EVIDENCE_COVERAGE,
} from "@/core/domain/matching/match-job";

export function activeEvidenceAwareMatchWhere(userId: string) {
  return {
    userId,
    scoringVersion: MATCH_SCORING_VERSION,
    job: {
      status: "ACTIVE" as const,
      candidateDispositions: {
        none: { userId, status: "REJECTED" as const },
      },
    },
  };
}

export function confirmedHighFitWhere(userId: string, threshold: number) {
  return {
    ...activeEvidenceAwareMatchWhere(userId),
    overallFit: { gte: threshold },
    evidenceCoverage: { gte: MINIMUM_HIGH_FIT_EVIDENCE_COVERAGE },
  };
}
