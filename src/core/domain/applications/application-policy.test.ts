import { describe, expect, it } from "vitest";
import {
  evaluateApplicationPolicy,
  type ApplicationPolicyContext,
  type CandidateApplicationPolicy,
} from "./application-policy";

const policy: CandidateApplicationPolicy = {
  allowedEmploymentTypes: ["FULL_TIME"],
  allowedLocations: ["Remote", "New York, NY"],
  allowedRoleFamilies: ["Software Engineering"],
  autonomyLevel: "AUTO_SUBMIT_AUTHORIZED",
  companyBlacklist: ["Blocked Co"],
  dailyApplicationLimit: 5,
  excludedSeniorities: ["EXECUTIVE"],
  minimumOverallFit: 75,
  rejectAuthorizationConflict: true,
  requireRemote: true,
  salaryMinimum: 100_000,
};

const context: ApplicationPolicyContext = {
  applicationsToday: 0,
  authorizationConflict: false,
  company: "Allowed Co",
  employmentType: "FULL_TIME",
  location: "Remote",
  overallFit: 92,
  remoteType: "REMOTE",
  roleFamily: "Software Engineering",
  salaryMaximum: 140_000,
  seniority: "SENIOR",
  sourceCanSubmit: true,
  submissionAuthorized: true,
  unresolvedSensitiveQuestions: 0,
  unsupportedClaims: 0,
};

describe("application policy engine", () => {
  it("makes a fully qualified authorized application eligible without submitting", () => {
    expect(evaluateApplicationPolicy(policy, context)).toEqual({
      result: "ELIGIBLE_FOR_SUBMISSION",
      reasons: [],
      version: "application-policy-v1",
    });
  });

  it.each([
    [
      "authorization conflict",
      { authorizationConflict: true },
      "AUTHORIZATION_CONFLICT",
    ],
    ["salary below floor", { salaryMaximum: 99_999 }, "SALARY_BELOW_MINIMUM"],
    ["weak fit", { overallFit: 74 }, "FIT_BELOW_MINIMUM"],
    ["excluded company", { company: "blocked co" }, "COMPANY_BLACKLISTED"],
    ["excluded seniority", { seniority: "EXECUTIVE" }, "SENIORITY_EXCLUDED"],
    ["wrong role family", { roleFamily: "Sales" }, "ROLE_FAMILY_EXCLUDED"],
    [
      "wrong employment type",
      { employmentType: "CONTRACT" },
      "EMPLOYMENT_TYPE_EXCLUDED",
    ],
    ["non-remote role", { remoteType: "HYBRID" }, "REMOTE_REQUIRED"],
    ["excluded location", { location: "Chicago, IL" }, "LOCATION_EXCLUDED"],
  ] as const)("rejects %s", (_label, override, reason) => {
    const decision = evaluateApplicationPolicy(policy, {
      ...context,
      ...override,
    });
    expect(decision.result).toBe("REJECT");
    expect(decision.reasons).toContain(reason);
  });

  it.each([
    ["unknown salary", { salaryMaximum: null }, "SALARY_UNKNOWN"],
    ["unknown location", { location: null }, "LOCATION_UNKNOWN"],
    ["unknown role family", { roleFamily: null }, "ROLE_FAMILY_UNKNOWN"],
    [
      "unknown employment type",
      { employmentType: null },
      "EMPLOYMENT_TYPE_UNKNOWN",
    ],
    ["unknown remote type", { remoteType: null }, "REMOTE_TYPE_UNKNOWN"],
    ["daily limit", { applicationsToday: 5 }, "DAILY_LIMIT_REACHED"],
    [
      "sensitive question",
      { unresolvedSensitiveQuestions: 1 },
      "UNRESOLVED_SENSITIVE_QUESTION",
    ],
    ["unsupported claim", { unsupportedClaims: 1 }, "UNSUPPORTED_CLAIM"],
  ] as const)("requires review for %s", (_label, override, reason) => {
    const decision = evaluateApplicationPolicy(policy, {
      ...context,
      ...override,
    });
    expect(decision.result).toBe("NEEDS_REVIEW");
    expect(decision.reasons).toContain(reason);
  });

  it("falls back to preparation when the source cannot submit", () => {
    expect(
      evaluateApplicationPolicy(policy, { ...context, sourceCanSubmit: false }),
    ).toMatchObject({
      result: "AUTO_PREPARE",
      reasons: ["SOURCE_CANNOT_SUBMIT"],
    });
  });

  it("requires review when submission was not authorized", () => {
    expect(
      evaluateApplicationPolicy(policy, {
        ...context,
        submissionAuthorized: false,
      }),
    ).toMatchObject({
      result: "NEEDS_REVIEW",
      reasons: ["AUTOMATION_NOT_AUTHORIZED"],
    });
  });

  it.each([
    ["RECOMMEND_ONLY", "RECOMMEND"],
    ["AUTO_PREPARE", "AUTO_PREPARE"],
  ] as const)("respects %s autonomy", (autonomyLevel, result) => {
    expect(
      evaluateApplicationPolicy({ ...policy, autonomyLevel }, context).result,
    ).toBe(result);
  });

  it("is deterministic for identical inputs", () => {
    const first = evaluateApplicationPolicy(policy, context);
    const second = evaluateApplicationPolicy(policy, context);
    expect(second).toEqual(first);
  });
});
