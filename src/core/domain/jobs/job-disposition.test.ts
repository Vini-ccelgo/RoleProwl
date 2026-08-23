import { describe, expect, it } from "vitest";
import {
  candidateDispositionLabel,
  jobIsVisibleInDispositionView,
  parseJobDispositionView,
} from "./job-disposition";

describe("candidate-owned job disposition", () => {
  it("hides candidate-rejected jobs from the default active view", () => {
    expect(jobIsVisibleInDispositionView("REJECTED", "active")).toBe(false);
    expect(jobIsVisibleInDispositionView("SHORTLISTED", "active")).toBe(true);
    expect(jobIsVisibleInDispositionView(null, "active")).toBe(true);
  });

  it("keeps shortlist and rejected history discoverable in explicit views", () => {
    expect(jobIsVisibleInDispositionView("SHORTLISTED", "shortlisted")).toBe(
      true,
    );
    expect(jobIsVisibleInDispositionView("REJECTED", "rejected")).toBe(true);
    expect(jobIsVisibleInDispositionView("REJECTED", "all")).toBe(true);
  });

  it("uses candidate-origin terminology and defaults malformed views safely", () => {
    expect(candidateDispositionLabel("REJECTED")).toBe("Rejected by you");
    expect(candidateDispositionLabel(null)).toBe("Undecided");
    expect(parseJobDispositionView("unexpected")).toBe("active");
  });
});
