import {
  MATCH_SCORING_VERSION,
  MINIMUM_HIGH_FIT_EVIDENCE_COVERAGE,
} from "@/core/domain/matching/match-job";
import { JOB_EVIDENCE_VERSION } from "@/core/domain/jobs/job-evidence";

export function currentMatchAnalysisWhere(userId: string) {
  return {
    userId,
    scoringVersion: MATCH_SCORING_VERSION,
    job: { evidenceVersion: JOB_EVIDENCE_VERSION },
  };
}

export function activeEvidenceAwareMatchWhere(userId: string) {
  return {
    ...currentMatchAnalysisWhere(userId),
    job: {
      evidenceVersion: JOB_EVIDENCE_VERSION,
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
