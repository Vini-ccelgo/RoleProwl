import { describe, expect, it, vi } from "vitest";
import {
  invalidateCandidateJobMatchAnalyses,
  invalidateJobMatchAnalyses,
} from "./invalidate-job-match-analyses";

describe("job-match staleness invalidation", () => {
  it("invalidates every version for only the changed candidate", async () => {
    const deleteMany = vi.fn(async () => ({ count: 2 }));
    await invalidateCandidateJobMatchAnalyses(
      { jobMatchAnalysis: { deleteMany } } as never,
      "candidate-a",
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "candidate-a" },
    });
  });

  it("invalidates every candidate analysis for only the refreshed job", async () => {
    const deleteMany = vi.fn(async () => ({ count: 3 }));
    await invalidateJobMatchAnalyses(
      { jobMatchAnalysis: { deleteMany } } as never,
      "job-a",
    );
    expect(deleteMany).toHaveBeenCalledWith({ where: { jobId: "job-a" } });
  });
});
