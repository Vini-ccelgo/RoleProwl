import { describe, expect, it } from "vitest";
import {
  activeEvidenceAwareMatchWhere,
  confirmedHighFitWhere,
} from "./match-query-policy";

describe("evidence-aware dashboard match queries", () => {
  it("excludes candidate-rejected jobs and stale scoring versions", () => {
    expect(activeEvidenceAwareMatchWhere("user-1")).toEqual({
      userId: "user-1",
      scoringVersion: "match-v1.1",
      job: {
        status: "ACTIVE",
        candidateDispositions: {
          none: { userId: "user-1", status: "REJECTED" },
        },
      },
    });
  });

  it("requires both the user threshold and sufficient coverage for high fit", () => {
    expect(confirmedHighFitWhere("user-1", 72)).toEqual(
      expect.objectContaining({
        overallFit: { gte: 72 },
        confidence: { gte: 0.5 },
      }),
    );
  });
});
