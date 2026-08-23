import { describe, expect, it } from "vitest";
import {
  APPLICATION_OUTCOME_POLICY_COPY,
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
