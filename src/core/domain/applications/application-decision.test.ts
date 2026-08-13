import { describe, expect, it } from "vitest";
import {
  applicationDecisionInputHash,
  decideApplication,
  type ApplicationDecisionInput,
} from "./application-decision";

const input: ApplicationDecisionInput = {
  claims: { total: 3, unsupported: 0 },
  fit: { overallFit: 91, confidence: 0.9 },
  job: { id: "job-1", company: "Acme", title: "Engineer" },
  materials: { resumeVersionId: "resume-1" },
  policy: {
    allowedEmploymentTypes: [],
    allowedLocations: [],
    allowedRoleFamilies: [],
    autonomyLevel: "AUTO_SUBMIT_AUTHORIZED",
    companyBlacklist: [],
    dailyApplicationLimit: 10,
    excludedSeniorities: [],
    minimumOverallFit: 70,
    rejectAuthorizationConflict: true,
    requireRemote: false,
    salaryMinimum: null,
  },
  policyContext: {
    applicationsToday: 0,
    authorizationConflict: false,
    company: "Acme",
    employmentType: null,
    location: null,
    overallFit: 91,
    remoteType: null,
    roleFamily: null,
    salaryMaximum: null,
    seniority: null,
  },
  questions: [],
  sourceCapability: { canSubmit: true, mode: "AUTHORIZED_API" },
  submissionAuthorized: true,
  userId: "user-1",
};

describe("application decision engine", () => {
  it("produces submission eligibility only when every input allows it", () => {
    expect(decideApplication(input)).toMatchObject({
      result: "ELIGIBLE_FOR_SUBMISSION",
      reasons: [],
      decisionVersion: "application-decision-v1",
    });
  });

  it("preserves specific unresolved question reasons", () => {
    expect(
      decideApplication({
        ...input,
        questions: [
          {
            classification: "LEGAL_OR_CONSEQUENTIAL",
            disposition: "NEEDS_REVIEW",
            reasonCode: "SPONSORSHIP_ANSWER_STALE",
          },
          {
            classification: "ATTESTATION",
            disposition: "NEEDS_REVIEW",
            reasonCode: "provider-label",
          },
        ],
      }),
    ).toMatchObject({
      result: "NEEDS_REVIEW",
      reasons: expect.arrayContaining([
        "SPONSORSHIP_ANSWER_STALE",
        "ATTESTATION_REQUIRED",
      ]),
    });
  });

  it("requires review for prepared narrative drafts", () => {
    expect(
      decideApplication({
        ...input,
        questions: [
          {
            classification: "JOB_SPECIFIC_FREE_TEXT",
            disposition: "PREPARE_DRAFT",
            reasonCode: "DRAFT_REVIEW_REQUIRED",
          },
        ],
      }),
    ).toMatchObject({
      result: "NEEDS_REVIEW",
      reasons: ["DRAFT_REVIEW_REQUIRED"],
    });
  });

  it("never hides a hard policy rejection behind review", () => {
    expect(
      decideApplication({
        ...input,
        policyContext: { ...input.policyContext, authorizationConflict: true },
        questions: [
          {
            classification: "ATTESTATION",
            disposition: "NEEDS_REVIEW",
            reasonCode: "ignored-label",
          },
        ],
      }).result,
    ).toBe("REJECT");
  });

  it("hashes canonical input reproducibly and detects material changes", () => {
    expect(applicationDecisionInputHash(input)).toBe(
      applicationDecisionInputHash(input),
    );
    expect(
      applicationDecisionInputHash({ ...input, submissionAuthorized: false }),
    ).not.toBe(applicationDecisionInputHash(input));
  });

  it("passes a 36-combination deterministic safety matrix", () => {
    const claimCounts = [0, 1, 2];
    const questionModes = ["NONE", "CONSEQUENTIAL", "ATTESTATION"] as const;
    const capabilities = [false, true];
    const authorizations = [false, true];
    let evaluated = 0;
    for (const unsupported of claimCounts) {
      for (const questionMode of questionModes) {
        for (const canSubmit of capabilities) {
          for (const submissionAuthorized of authorizations) {
            const questions =
              questionMode === "NONE"
                ? []
                : [
                    {
                      classification:
                        questionMode === "ATTESTATION"
                          ? ("ATTESTATION" as const)
                          : ("LEGAL_OR_CONSEQUENTIAL" as const),
                      disposition: "NEEDS_REVIEW" as const,
                      reasonCode:
                        questionMode === "ATTESTATION"
                          ? "ATTESTATION_REQUIRED"
                          : "CONSEQUENTIAL_ANSWER_UNRESOLVED",
                    },
                  ];
            const matrixInput = {
              ...input,
              claims: { total: 3, unsupported },
              questions,
              sourceCapability: {
                canSubmit,
                mode: canSubmit ? "AUTHORIZED_API" : "EXTERNAL",
              },
              submissionAuthorized,
            };
            const first = decideApplication(matrixInput);
            const replay = decideApplication(matrixInput);
            expect(replay).toEqual(first);
            if (
              unsupported > 0 ||
              questionMode !== "NONE" ||
              !canSubmit ||
              !submissionAuthorized
            ) {
              expect(first.result).not.toBe("ELIGIBLE_FOR_SUBMISSION");
            }
            evaluated += 1;
          }
        }
      }
    }
    expect(evaluated).toBe(36);
  });
});
