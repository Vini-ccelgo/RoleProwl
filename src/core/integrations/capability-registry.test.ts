import { describe, expect, it } from "vitest";
import {
  INTEGRATION_SOURCES,
  resolveIntegrationCapability,
} from "./capability-registry";

describe("integration capability registry", () => {
  it("defines every supported or explicitly prohibited source", () => {
    expect(INTEGRATION_SOURCES).toEqual([
      "GREENHOUSE",
      "LEVER",
      "LINKEDIN",
      "INDEED",
      "EXTERNAL",
    ]);
  });

  it("does not infer Greenhouse submission from public job access", () => {
    const capability = resolveIntegrationCapability({
      source: "GREENHOUSE",
      partnerSubmissionAuthorized: false,
    });
    expect(capability.capabilities.has("READ_JOBS")).toBe(true);
    expect(capability.capabilities.has("SUBMIT_APPLICATION")).toBe(false);
    expect(capability.mode).toBe("EXTERNAL_APPLICATION");
  });

  it("advertises submission only with explicit partner authorization", () => {
    const capability = resolveIntegrationCapability({
      source: "LEVER",
      partnerSubmissionAuthorized: true,
    });
    expect(capability.canSubmit).toBe(true);
    expect(capability.capabilities.has("SUBMIT_APPLICATION")).toBe(true);
    expect(capability.mode).toBe("AUTHORIZED_API");
  });

  it.each(["LINKEDIN", "INDEED"] as const)(
    "keeps %s prohibited despite a claimed authorization flag",
    (source) => {
      const capability = resolveIntegrationCapability({
        source,
        partnerSubmissionAuthorized: true,
      });
      expect(capability.prohibitedAutomation).toBe(true);
      expect(capability.canSubmit).toBe(false);
      expect(capability.mode).toBe("MANUAL_EXTERNAL");
    },
  );
});
