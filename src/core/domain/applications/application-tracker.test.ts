import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATES,
  assertApplicationTransition,
  trackerOutcome,
} from "./application-tracker";

describe("application tracker", () => {
  it("retains the complete alpha state vocabulary", () => {
    expect(APPLICATION_STATES).toHaveLength(14);
    expect(APPLICATION_STATES).toContain("NEEDS_REVIEW");
    expect(APPLICATION_STATES).toContain("OFFER");
  });

  it.each([
    ["READY", "SUBMITTED"],
    ["SUBMITTED", "INTERVIEW"],
    ["INTERVIEW", "OFFER"],
    ["FAILED", "PREPARING"],
  ] as const)("allows %s to %s", (current, next) => {
    expect(() => assertApplicationTransition(current, next)).not.toThrow();
  });

  it.each([
    ["DISCOVERED", "OFFER"],
    ["READY", "INTERVIEW"],
    ["CLOSED", "PREPARING"],
    ["SUBMITTED", "SUBMITTED"],
  ] as const)("rejects %s to %s", (current, next) => {
    expect(() => assertApplicationTransition(current, next)).toThrow();
  });

  it("does not manufacture an outcome for an in-progress application", () => {
    expect(trackerOutcome("INTERVIEW")).toBeNull();
    expect(trackerOutcome("REJECTED")).toBe("REJECTED");
  });
});
