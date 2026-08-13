import { describe, expect, it, vi } from "vitest";
import type { ApplicationDecisionInput } from "@/core/domain/applications/application-decision";
import { decideAndRecordApplication } from "./decide-and-record-application";

function decisionInput(needsReview: boolean): ApplicationDecisionInput {
  return {
    claims: { total: 1, unsupported: 0 },
    fit: { overallFit: 90 },
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
      overallFit: 90,
      remoteType: null,
      roleFamily: null,
      salaryMaximum: null,
      seniority: null,
    },
    questions: needsReview
      ? [
          {
            classification: "ATTESTATION",
            disposition: "NEEDS_REVIEW",
            reasonCode: "provider-label",
          },
        ]
      : [],
    sourceCapability: { canSubmit: true, mode: "AUTHORIZED_API" },
    submissionAuthorized: true,
    userId: "user-1",
  };
}

describe("decideAndRecordApplication", () => {
  it("sends a complete queue snapshot when review is required", async () => {
    const save = vi
      .fn()
      .mockResolvedValue({ id: "decision-1", reviewQueueItemId: "queue-1" });
    const result = await decideAndRecordApplication({
      decisionInput: decisionInput(true),
      repository: { save },
    });
    expect(result.result).toBe("NEEDS_REVIEW");
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        queueSnapshot: expect.objectContaining({
          reasonCodes: ["ATTESTATION_REQUIRED"],
          unresolvedQuestions: expect.any(Array),
        }),
      }),
    );
  });

  it("does not create queue data for an eligible decision", async () => {
    const save = vi
      .fn()
      .mockResolvedValue({ id: "decision-2", reviewQueueItemId: null });
    await decideAndRecordApplication({
      decisionInput: decisionInput(false),
      repository: { save },
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ queueSnapshot: null }),
    );
  });
});
