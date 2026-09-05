import { describe, expect, it } from "vitest";
import { candidateJobCatalogQuery } from "./candidate-job-catalog";

describe("shared canonical job catalog ownership", () => {
  it("shares active Job rows while scoping every candidate-owned relation", () => {
    const candidateA = candidateJobCatalogQuery("candidate-a", "active");
    const candidateB = candidateJobCatalogQuery("candidate-b", "active");

    expect(candidateA.where.status).toBe("ACTIVE");
    expect(candidateB.where.status).toBe("ACTIVE");
    expect(candidateA.where).not.toHaveProperty("userId");
    expect(candidateB.where).not.toHaveProperty("userId");

    expect(candidateA.include.candidateDispositions.where).toEqual({
      userId: "candidate-a",
    });
    expect(candidateA.include.matchAnalyses.where.userId).toBe("candidate-a");
    expect(candidateA.include.matchAnalyses.where.job).toEqual({
      evidenceVersion: "job-evidence-v3",
    });
    expect(candidateA.include.matchAnalyses.include.feedback.where).toEqual({
      userId: "candidate-a",
    });
    expect(candidateA.include.applications.where).toEqual({
      userId: "candidate-a",
    });

    expect(candidateB.include.candidateDispositions.where).toEqual({
      userId: "candidate-b",
    });
    expect(candidateB.include.matchAnalyses.where.userId).toBe("candidate-b");
    expect(candidateB.include.matchAnalyses.where.job).toEqual({
      evidenceVersion: "job-evidence-v3",
    });
    expect(candidateB.include.matchAnalyses.include.feedback.where).toEqual({
      userId: "candidate-b",
    });
    expect(candidateB.include.applications.where).toEqual({
      userId: "candidate-b",
    });
  });

  it("filters shortlist and rejection views by the requesting candidate", () => {
    expect(
      candidateJobCatalogQuery("candidate-a", "shortlisted").where
        .candidateDispositions,
    ).toEqual({
      some: { status: "SHORTLISTED", userId: "candidate-a" },
    });
    expect(
      candidateJobCatalogQuery("candidate-b", "rejected").where
        .candidateDispositions,
    ).toEqual({
      some: { status: "REJECTED", userId: "candidate-b" },
    });
  });
});
