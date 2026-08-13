import { describe, expect, it } from "vitest";
import type { AuthProvider, AuthenticatedActor } from "@/core/contracts";
import { AuthorizationError } from "@/core/errors/application-errors";
import { requireAuthenticatedActor } from "./require-authenticated-actor";

class FixtureAuthProvider implements AuthProvider {
  constructor(private readonly actor: AuthenticatedActor | null) {}
  async currentActor(): Promise<AuthenticatedActor | null> {
    return this.actor;
  }
}

describe("authenticated resource guard", () => {
  it("allows an authenticated fixture actor", async () => {
    const actor = {
      id: "roleprowl-user-1",
      externalId: "clerk-user-1",
      email: "candidate@example.test",
    };
    await expect(
      requireAuthenticatedActor(new FixtureAuthProvider(actor)),
    ).resolves.toEqual(actor);
  });

  it("rejects a missing or invalid session", async () => {
    await expect(
      requireAuthenticatedActor(new FixtureAuthProvider(null)),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
