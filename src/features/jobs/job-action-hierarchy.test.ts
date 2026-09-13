import { describe, expect, it } from "vitest";
import { jobActionHierarchy } from "./job-action-hierarchy";

describe("job card progressive action hierarchy", () => {
  it("lets an untouched job enter Apply without fit analysis", () => {
    expect(
      jobActionHierarchy({
        analyzed: false,
        applicationExists: false,
        disposition: null,
        preparationAvailable: true,
      }),
    ).toEqual({
      primary: ["PREPARE_APPLICATION"],
      secondary: ["ANALYZE_FIT", "SHORTLIST", "NOT_PURSUING"],
    });
  });

  it("keeps Apply primary and fit review optional after analysis", () => {
    expect(
      jobActionHierarchy({
        analyzed: true,
        applicationExists: false,
        disposition: null,
        preparationAvailable: true,
      }).primary,
    ).toEqual(["PREPARE_APPLICATION"]);
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
