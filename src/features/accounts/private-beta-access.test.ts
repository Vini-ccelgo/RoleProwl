import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  PrivateBetaAccessError,
} from "@/core/errors/application-errors";
import { requirePrivateBetaAdmission } from "./private-beta-access";

const actor = {
  id: "user-1",
  externalId: "clerk-1",
  email: "Candidate@Example.Test",
};

describe("private-beta admission", () => {
  it("preserves normal authenticated access when beta mode is disabled", () => {
    expect(requirePrivateBetaAdmission(actor, {})).toBe(actor);
  });

  it("allows only an exact normalized invited email", () => {
    expect(
      requirePrivateBetaAdmission(actor, {
        ROLEPROWL_PRIVATE_BETA_ENABLED: "true",
        ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS:
          " other@example.test, candidate@example.test ",
      }),
    ).toBe(actor);
  });

  it("denies an authenticated non-invited account", () => {
    expect(() =>
      requirePrivateBetaAdmission(actor, {
        ROLEPROWL_PRIVATE_BETA_ENABLED: "true",
        ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS: "invited@example.test",
      }),
    ).toThrow(PrivateBetaAccessError);
  });

  it("fails closed for a missing or malformed enabled allowlist", () => {
    expect(() =>
      requirePrivateBetaAdmission(actor, {
        ROLEPROWL_PRIVATE_BETA_ENABLED: "true",
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      requirePrivateBetaAdmission(actor, {
        ROLEPROWL_PRIVATE_BETA_ENABLED: "true",
        ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS: "not-an-email",
      }),
    ).toThrow(ConfigurationError);
  });
});
