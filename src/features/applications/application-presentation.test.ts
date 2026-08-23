import { describe, expect, it } from "vitest";
import {
  APPLICATION_OUTCOME_POLICY_COPY,
  applicationNextAction,
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
    expect(applicationNextAction("READY")).toBe("Open employer application");
    expect(applicationNextAction("SUBMITTED")).toBe(
      "Record a confirmed outcome",
    );
  });
});
