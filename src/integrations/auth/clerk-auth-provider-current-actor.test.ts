import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser, isClerkConfigured } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  isClerkConfigured: vi.fn(() => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/auth/config", () => ({ isClerkConfigured }));

import { ClerkAuthProvider } from "./clerk-auth-provider";

function deletedUserError() {
  return {
    clerkError: true,
    code: "api_response_error",
    status: 404,
    errors: [{ code: "resource_not_found", message: "not found" }],
  };
}

describe("Clerk current actor resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("treats a conclusively deleted Clerk user as unauthenticated without provisioning", async () => {
    currentUser.mockRejectedValueOnce(deletedUserError());
    const repository = { upsertIdentity: vi.fn() };
    await expect(
      new ClerkAuthProvider(repository as never).currentActor(),
    ).resolves.toBeNull();
    expect(repository.upsertIdentity).not.toHaveBeenCalled();
  });

  it("keeps unexpected Clerk failures observable", async () => {
    const failure = new Error("Clerk network unavailable");
    currentUser.mockRejectedValueOnce(failure);
    const repository = { upsertIdentity: vi.fn() };
    await expect(
      new ClerkAuthProvider(repository as never).currentActor(),
    ).rejects.toBe(failure);
    expect(repository.upsertIdentity).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an unrelated 404",
      { ...deletedUserError(), errors: [{ code: "other" }] },
    ],
    ["a provider 500", { ...deletedUserError(), status: 500 }],
    ["a rate limit", { ...deletedUserError(), status: 429 }],
    ["a non-Clerk response", { ...deletedUserError(), clerkError: false }],
  ])("keeps %s observable", async (_label, failure) => {
    currentUser.mockRejectedValueOnce(failure);
    const repository = { upsertIdentity: vi.fn() };

    await expect(
      new ClerkAuthProvider(repository as never).currentActor(),
    ).rejects.toBe(failure);
    expect(repository.upsertIdentity).not.toHaveBeenCalled();
  });

  it("allows a later valid Clerk identity to provision a fresh RoleProwl account", async () => {
    currentUser.mockResolvedValueOnce({
      id: "clerk-fresh",
      primaryEmailAddress: { emailAddress: "invited@example.test" },
      emailAddresses: [],
    });
    const repository = {
      upsertIdentity: vi.fn(async () => ({
        id: "roleprowl-fresh",
        authProvider: "CLERK",
        externalAuthId: "clerk-fresh",
        email: "invited@example.test",
        deletedAt: null,
      })),
    };
    await expect(
      new ClerkAuthProvider(repository as never).currentActor(),
    ).resolves.toEqual({
      id: "roleprowl-fresh",
      externalId: "clerk-fresh",
      email: "invited@example.test",
    });
    expect(repository.upsertIdentity).toHaveBeenCalledWith({
      provider: "CLERK",
      externalId: "clerk-fresh",
      email: "invited@example.test",
    });
  });
});
