import { describe, expect, it } from "vitest";
import { applicationPolicySchema } from "./application-policy-schema";

const valid = {
  allowedRoleFamilies: [],
  minimumOverallFit: 70,
  excludedSeniorities: [],
  salaryMinimum: null,
  allowedLocations: [],
  requireRemote: false,
  allowedEmploymentTypes: [],
  rejectAuthorizationConflict: true,
  companyBlacklist: [],
  dailyApplicationLimit: 10,
  autonomyLevel: "RECOMMEND_ONLY",
};

describe("application policy configuration", () => {
  it("accepts a bounded candidate-defined policy", () => {
    expect(applicationPolicySchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    [{ minimumOverallFit: 101 }, "fit over 100"],
    [{ minimumOverallFit: -1 }, "negative fit"],
    [{ salaryMinimum: 0 }, "nonpositive salary"],
    [{ dailyApplicationLimit: 0 }, "zero daily limit"],
    [{ dailyApplicationLimit: 101 }, "excessive daily limit"],
  ])("rejects %s", (override, label) => {
    expect(label).toBeTypeOf("string");
    expect(
      applicationPolicySchema.safeParse({ ...valid, ...override }).success,
    ).toBe(false);
  });
});
