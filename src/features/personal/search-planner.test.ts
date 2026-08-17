import { describe, expect, it } from "vitest";
import { buildPersonalSearchPlan } from "./search-planner";

describe("personal search planner", () => {
  it("prioritizes explicit terms and roles, deduplicates, and stays bounded", () => {
    expect(
      buildPersonalSearchPlan({
        resume: "SIEM and cloud security",
        searchTerms: ["cybersecurity", "SOC Analyst"],
        targetRoles: [
          "SOC Analyst",
          "Security Analyst",
          "Junior Security Engineer",
        ],
      }),
    ).toEqual([
      "cybersecurity",
      "SOC Analyst",
      "Security Analyst",
      "Junior Security Engineer",
      "information security",
      "cloud security",
    ]);
  });
});
