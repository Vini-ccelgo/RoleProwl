import { describe, expect, it } from "vitest";
import {
  preparedApplicationsWhere,
  submittedApplicationsWhere,
} from "./application-metrics";

describe("application dashboard metrics", () => {
  it("counts only candidate-reviewed, submission-ready records as prepared", () => {
    expect(preparedApplicationsWhere("user-1")).toEqual({
      userId: "user-1",
      state: "READY",
    });
  });

  it("keeps counting an application as submitted after later outcome transitions", () => {
    expect(submittedApplicationsWhere("user-1")).toEqual({
      userId: "user-1",
      submittedAt: { not: null },
    });
  });
});
