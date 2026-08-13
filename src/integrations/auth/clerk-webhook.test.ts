import { describe, expect, it } from "vitest";
import { identityFromClerkUser } from "./clerk-webhook";

describe("Clerk webhook mapping", () => {
  it("prefers the explicitly primary email address", () => {
    expect(
      identityFromClerkUser({
        id: "user_1",
        primary_email_address_id: "email_primary",
        email_addresses: [
          { id: "email_other", email_address: "other@example.test" },
          { id: "email_primary", email_address: "primary@example.test" },
        ],
      }),
    ).toEqual({
      provider: "CLERK",
      externalId: "user_1",
      email: "primary@example.test",
    });
  });

  it("does not manufacture a missing email", () => {
    expect(identityFromClerkUser({ id: "user_2" }).email).toBeNull();
  });
});
