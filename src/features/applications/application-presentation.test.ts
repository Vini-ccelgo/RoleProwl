import { describe, expect, it } from "vitest";
import {
  APPLICATION_OUTCOME_POLICY_COPY,
  applicationOverviewCounts,
  applicationNextAction,
  applicationOutcomeActionLabel,
  applicationStateLabel,
} from "./application-presentation";

describe("application lifecycle presentation", () => {
  it("uses the required no-guessing copy exactly", () => {
    expect(APPLICATION_OUTCOME_POLICY_COPY).toBe(
      "RoleProwl does not guess application outcomes.",
    );
  });

  it("distinguishes employer rejection from candidate job rejection", () => {
    expect(applicationStateLabel("REJECTED")).toBe("Rejected by employer");
  });

  it("provides a state-specific next action", () => {
    expect(applicationNextAction("PREPARING")).toBe("Review preparation");
    expect(applicationNextAction("READY")).toBe("Continue on employer site");
    expect(applicationNextAction("SUBMITTED")).toBe(
      "Record a confirmed outcome",
    );
  });

  it("renders the canonical SUBMITTING row label as Submitting", () => {
    expect(applicationStateLabel("SUBMITTING")).toBe("Submitting");
  });

  it("counts one SUBMITTING application only as tracked and submitting", () => {
    expect(
      applicationOverviewCounts([
        { state: "SUBMITTING", submittedAt: new Date("2026-08-28") },
      ]),
    ).toEqual({
      tracked: 1,
      submitting: 1,
      submitted: 0,
      needsAttention: 0,
    });
  });

  it("counts one SUBMITTED application only as tracked and submitted", () => {
    expect(
      applicationOverviewCounts([{ state: "SUBMITTED", submittedAt: null }]),
    ).toEqual({
      tracked: 1,
      submitting: 0,
      submitted: 1,
      needsAttention: 0,
    });
  });

  it("aggregates mixed states without changing needs-attention semantics", () => {
    expect(
      applicationOverviewCounts([
        { state: "SUBMITTING", submittedAt: null },
        { state: "SUBMITTED", submittedAt: new Date("2026-08-28") },
        { state: "RESPONSE", submittedAt: new Date("2026-08-27") },
        { state: "NEEDS_REVIEW", submittedAt: null },
        { state: "FAILED", submittedAt: null },
        { state: "READY", submittedAt: null },
      ]),
    ).toEqual({
      tracked: 6,
      submitting: 1,
      submitted: 2,
      needsAttention: 2,
    });
  });

  it("keeps a zero Submitting count explicit", () => {
    expect(applicationOverviewCounts([])).toEqual({
      tracked: 0,
      submitting: 0,
      submitted: 0,
      needsAttention: 0,
    });
  });

  it("presents allowed outcome states as actions without changing enum values", () => {
    expect(applicationOutcomeActionLabel("CLOSED")).toBe("Close application");
    expect(applicationOutcomeActionLabel("WITHDRAWN")).toBe(
      "Withdraw application",
    );
    expect(applicationOutcomeActionLabel("REJECTED")).toBe(
      "Record employer rejection",
    );
    expect(applicationOutcomeActionLabel("INTERVIEW")).toBe("Record interview");
    expect(applicationOutcomeActionLabel("OFFER")).toBe("Record offer");
  });
});
