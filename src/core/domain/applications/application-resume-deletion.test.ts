import { describe, expect, it } from "vitest";
import {
  applicationHasSubmissionHistory,
  applicationIsProtectedFromResumeDeletion,
  classifyApplicationForResumeDeletion,
} from "./application-resume-deletion";

function application(
  state:
    | "DISCOVERED"
    | "SHORTLISTED"
    | "PREPARING"
    | "NEEDS_REVIEW"
    | "READY"
    | "SUBMITTING"
    | "SUBMITTED"
    | "RESPONSE"
    | "INTERVIEW"
    | "REJECTED"
    | "WITHDRAWN"
    | "OFFER"
    | "CLOSED"
    | "FAILED",
  overrides: Partial<{
    externalConfirmedAt: Date | null;
    externalSubmissionId: string | null;
    hasSubmissionConfirmationEvent: boolean;
    submittedAt: Date | null;
  }> = {},
) {
  return {
    externalConfirmedAt: null,
    externalSubmissionId: null,
    hasSubmissionConfirmationEvent: false,
    state,
    submittedAt: null,
    ...overrides,
  };
}

describe("application résumé-deletion boundary", () => {
  it.each([
    "DISCOVERED",
    "SHORTLISTED",
    "PREPARING",
    "NEEDS_REVIEW",
    "READY",
    "FAILED",
    "WITHDRAWN",
    "CLOSED",
  ] as const)(
    "permits a referenced %s application with no submission history",
    (state) => {
      expect(applicationIsProtectedFromResumeDeletion(application(state))).toBe(
        false,
      );
      expect(classifyApplicationForResumeDeletion(application(state))).toBe(
        "DISPOSABLE_PRE_SUBMISSION",
      );
    },
  );

  it.each(["SUBMITTED", "RESPONSE", "INTERVIEW", "REJECTED", "OFFER"] as const)(
    "protects the unambiguously historical %s state",
    (state) => {
      expect(applicationHasSubmissionHistory(application(state))).toBe(true);
      expect(applicationIsProtectedFromResumeDeletion(application(state))).toBe(
        true,
      );
      expect(classifyApplicationForResumeDeletion(application(state))).toBe(
        "RETAINED_SUBMISSION_HISTORY",
      );
    },
  );

  it("protects an active submission before confirmation is recorded", () => {
    expect(
      applicationIsProtectedFromResumeDeletion(application("SUBMITTING")),
    ).toBe(true);
  });

  it.each(["WITHDRAWN", "CLOSED", "FAILED"] as const)(
    "uses persisted submission evidence to protect ambiguous %s history",
    (state) => {
      expect(
        applicationIsProtectedFromResumeDeletion(
          application(state, { submittedAt: new Date("2026-08-27") }),
        ),
      ).toBe(true);
    },
  );

  it("treats external confirmation or an employer submission id as history", () => {
    expect(
      applicationHasSubmissionHistory(
        application("FAILED", { externalSubmissionId: "employer-123" }),
      ),
    ).toBe(true);
    expect(
      applicationHasSubmissionHistory(
        application("CLOSED", {
          externalConfirmedAt: new Date("2026-08-27"),
        }),
      ),
    ).toBe(true);
  });

  it("treats a persisted submission-confirmed event as history even when scalar evidence is absent", () => {
    expect(
      classifyApplicationForResumeDeletion(
        application("CLOSED", { hasSubmissionConfirmationEvent: true }),
      ),
    ).toBe("RETAINED_SUBMISSION_HISTORY");
  });
});
