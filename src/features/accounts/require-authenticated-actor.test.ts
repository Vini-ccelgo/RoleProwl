import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthProvider, AuthenticatedActor } from "@/core/contracts";
import {
  AuthorizationError,
  PrivateBetaAccessError,
} from "@/core/errors/application-errors";
import {
  requireAuthenticatedActor,
  resolveWorkspaceAdmission,
} from "./require-authenticated-actor";

class FixtureAuthProvider implements AuthProvider {
  constructor(private readonly actor: AuthenticatedActor | null) {}
  async currentActor(): Promise<AuthenticatedActor | null> {
    return this.actor;
  }
}

describe("authenticated resource guard", () => {
  afterEach(() => vi.unstubAllEnvs());

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

  it("distinguishes authentication from private-beta admission", async () => {
    vi.stubEnv("ROLEPROWL_PRIVATE_BETA_ENABLED", "true");
    vi.stubEnv("ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS", "invited@example.test");
    const invited = new FixtureAuthProvider({
      id: "user-a",
      externalId: "clerk-a",
      email: "invited@example.test",
    });
    const nonInvited = new FixtureAuthProvider({
      id: "user-c",
      externalId: "clerk-c",
      email: "outside@example.test",
    });

    await expect(resolveWorkspaceAdmission(invited)).resolves.toEqual({
      actor: expect.objectContaining({ id: "user-a" }),
      status: "ALLOWED",
    });
    await expect(resolveWorkspaceAdmission(nonInvited)).resolves.toEqual({
      status: "PRIVATE_BETA_DENIED",
    });
    await expect(requireAuthenticatedActor(nonInvited)).rejects.toBeInstanceOf(
      PrivateBetaAccessError,
    );
  });
});
