import { describe, expect, it } from "vitest";
import { buildDecisionCapability } from "./build-decision-capability";

describe("decision capability input", () => {
  it("is sourced from the central registry", () => {
    expect(
      buildDecisionCapability({
        source: "GREENHOUSE",
        partnerSubmissionAuthorized: false,
      }),
    ).toEqual({ canSubmit: false, mode: "EXTERNAL_APPLICATION" });
  });

  it("cannot turn a prohibited source into an authorized API", () => {
    expect(
      buildDecisionCapability({
        source: "LINKEDIN",
        partnerSubmissionAuthorized: true,
      }),
    ).toEqual({ canSubmit: false, mode: "MANUAL_EXTERNAL" });
  });
});
