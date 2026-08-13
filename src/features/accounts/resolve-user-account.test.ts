import { describe, expect, it } from "vitest";
import type {
  ExternalIdentity,
  UserAccount,
  UserAccountRepository,
} from "@/core/contracts";
import {
  NotFoundError,
  ValidationError,
} from "@/core/errors/application-errors";
import {
  assertOwnedResource,
  resolveUserAccount,
} from "./resolve-user-account";

class FakeUserRepository implements UserAccountRepository {
  private readonly users = new Map<string, UserAccount>();

  async upsertIdentity(identity: ExternalIdentity): Promise<UserAccount> {
    const key = `${identity.provider}:${identity.externalId}`;
    const existing = this.users.get(key);
    const user: UserAccount = {
      id: existing?.id ?? `roleprowl-${this.users.size + 1}`,
      authProvider: identity.provider,
      externalAuthId: identity.externalId,
      email: identity.email,
      deletedAt: null,
    };
    this.users.set(key, user);
    return user;
  }

  async deactivateIdentity(): Promise<void> {}
}

describe("RoleProwl account resolution", () => {
  it("maps a stable external identity to a stable internal account", async () => {
    const repository = new FakeUserRepository();
    const identity = {
      provider: "CLERK",
      externalId: "user_external_1",
      email: "candidate@example.test",
    } as const;

    const first = await resolveUserAccount(identity, repository);
    const second = await resolveUserAccount(identity, repository);

    expect(second.id).toBe(first.id);
    expect(first.externalId).toBe(identity.externalId);
    expect(first.email).toBe(identity.email);
  });

  it("rejects an invalid session identity", async () => {
    const repository = new FakeUserRepository();
    await expect(
      resolveUserAccount(
        { provider: "CLERK", externalId: " ", email: null },
        repository,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("conceals foreign resources from an authenticated actor", () => {
    expect(() => assertOwnedResource("user-a", "user-b")).toThrow(
      NotFoundError,
    );
    expect(() => assertOwnedResource("user-a", "user-a")).not.toThrow();
  });
});
