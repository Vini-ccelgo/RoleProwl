import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClerkAPIResponseError } from "@clerk/nextjs/errors";

const { currentUser, isClerkConfigured } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  isClerkConfigured: vi.fn(() => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/auth/config", () => ({ isClerkConfigured }));

import { ClerkAuthProvider } from "./clerk-auth-provider";

function deletedUserError() {
  return new ClerkAPIResponseError("User not found", {
    status: 404,
    data: [{ code: "resource_not_found", message: "User not found" }],
  });
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
