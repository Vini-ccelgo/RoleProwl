import { describe, expect, it } from "vitest";
import { preferenceAllows } from "./notification-preferences";

const preferences = {
  applicationUpdates: false,
  jobUpdates: true,
  reviewRequired: false,
  workflowFailures: true,
};

describe("notification preferences", () => {
  it("defaults existing users to enabled notifications", () => {
    expect(preferenceAllows("APPLICATION_NEEDS_REVIEW", null)).toBe(true);
  });

  it("maps every existing notification type to a persisted category", () => {
    expect(preferenceAllows("APPLICATION_SUBMITTED", preferences)).toBe(false);
    expect(preferenceAllows("JOB_UNAVAILABLE", preferences)).toBe(true);
    expect(preferenceAllows("WORKFLOW_FAILED", preferences)).toBe(true);
    expect(preferenceAllows("APPLICATION_NEEDS_REVIEW", preferences)).toBe(
      false,
    );
    expect(preferenceAllows("QUESTION_NEEDS_ANSWER", preferences)).toBe(false);
  });
});
