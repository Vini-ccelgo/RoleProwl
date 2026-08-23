import { describe, expect, it } from "vitest";
import { jobActionHierarchy } from "./job-action-hierarchy";

describe("job card progressive action hierarchy", () => {
  it("keeps untouched jobs focused on analysis and candidate disposition", () => {
    expect(
      jobActionHierarchy({
        analyzed: false,
        applicationExists: false,
        disposition: null,
        preparationAvailable: true,
      }),
    ).toEqual({
      primary: ["ANALYZE_FIT"],
      secondary: ["SHORTLIST", "NOT_PURSUING"],
    });
  });

  it("advances analyzed jobs to fit review and application preparation", () => {
    expect(
      jobActionHierarchy({
        analyzed: true,
        applicationExists: false,
        disposition: null,
        preparationAvailable: true,
      }).primary,
    ).toEqual(["REVIEW_FIT", "PREPARE_APPLICATION"]);
  });

  it("prioritizes continuation once an application exists", () => {
    expect(
      jobActionHierarchy({
        analyzed: true,
        applicationExists: true,
        disposition: null,
        preparationAvailable: true,
      }),
    ).toEqual({ primary: ["CONTINUE_APPLICATION"], secondary: [] });
  });
});
