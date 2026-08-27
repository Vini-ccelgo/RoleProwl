import { describe, expect, it } from "vitest";
import {
  applicationHasSubmissionHistory,
  applicationIsProtectedFromResumeDeletion,
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
    submittedAt: Date | null;
  }> = {},
) {
  return {
    externalConfirmedAt: null,
    externalSubmissionId: null,
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
    },
  );

  it.each(["SUBMITTED", "RESPONSE", "INTERVIEW", "REJECTED", "OFFER"] as const)(
    "protects the unambiguously historical %s state",
    (state) => {
      expect(applicationHasSubmissionHistory(application(state))).toBe(true);
      expect(applicationIsProtectedFromResumeDeletion(application(state))).toBe(
        true,
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
});
