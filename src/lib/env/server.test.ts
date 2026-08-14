import { describe, expect, it } from "vitest";
import { validateServerEnvironment } from "./server";

describe("server environment validation", () => {
  it("accepts optional integrations when omitted or fully configured", () => {
    expect(validateServerEnvironment({ NODE_ENV: "test" })).toMatchObject({
      NODE_ENV: "test",
    });
    expect(
      validateServerEnvironment({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_value",
        CLERK_SECRET_KEY: "sk_test_value",
        INNGEST_EVENT_KEY: "event-key",
        INNGEST_SIGNING_KEY: "signing-key",
      }),
    ).toMatchObject({ CLERK_SECRET_KEY: "sk_test_value" });
  });

  it("rejects partial provider configuration and unreasonable AI controls", () => {
    expect(() =>
      validateServerEnvironment({ CLERK_SECRET_KEY: "only-one-key" }),
    ).toThrow("configured together");
    expect(() =>
      validateServerEnvironment({ INNGEST_EVENT_KEY: "only-one-key" }),
    ).toThrow("configured together");
    expect(() =>
      validateServerEnvironment({ ROLEPROWL_AI_TIMEOUT_MS: "999999" }),
    ).toThrow();
    expect(() =>
      validateServerEnvironment({ ROLEPROWL_AI_MAX_RETRIES: "99" }),
    ).toThrow();
  });
});
