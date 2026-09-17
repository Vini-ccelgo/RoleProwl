import { describe, expect, it } from "vitest";
import { candidateInterventionMetric } from "./candidate-intervention-metric";
import type { ApplicationQuestionResolution } from "./application-question-resolution";

describe("candidate intervention metric", () => {
  it("separates automatic, one-click, entered, and employer-site decisions", () => {
    const resolutions = [
      "AUTO_RESOLVED",
      "AUTO_RESOLVED",
      "PROPOSED_FOR_CANDIDATE",
      "CANDIDATE_REQUIRED",
      "HUMAN_REQUIRED",
      "UNSUPPORTED",
    ].map(
      (disposition, index) =>
        ({
          questionId: `question-${index}`,
          canonicalConcept: null,
          disposition,
          value: null,
          candidateKnowledgeReferences: [],
          reasonCode: "TEST",
        }) as ApplicationQuestionResolution,
    );
    expect(candidateInterventionMetric(resolutions)).toEqual({
      totalEmployerSemanticDecisions: 6,
      automaticallyResolved: 2,
      oneClickProposals: 1,
      candidateEnteredAnswers: 1,
      employerSiteIrreducibleSteps: 2,
    });
  });
});
