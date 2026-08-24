import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteAccount: vi.fn(async () => ({ status: "COMPLETE" as const })),
  redirect: vi.fn(),
  requireAuthenticatedActor: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor: mocks.requireAuthenticatedActor,
}));
vi.mock("@/features/privacy/delete-account", () => ({
  deleteAccount: mocks.deleteAccount,
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/integrations/auth/clerk-identity-manager", () => ({
  ClerkIdentityManager: class {},
}));
vi.mock("@/integrations/privacy/prisma-account-deletion-repository", () => ({
  PrismaAccountDeletionRepository: class {},
}));
vi.mock("@/integrations/storage/document-storage", () => ({
  documentStorage: vi.fn(() => ({})),
}));
vi.mock("@/lib/db/client", () => ({ databaseClient: vi.fn(() => ({})) }));

import { deleteAccountAction } from "./actions";

describe("account deletion action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores forged owner input and deletes only the authenticated actor", async () => {
    const formData = new FormData();
    formData.set("confirmation", "DELETE ROLEPROWL ACCOUNT");
    formData.set("userId", "user-2");
    await deleteAccountAction(formData);
    expect(mocks.deleteAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        confirmation: "DELETE ROLEPROWL ACCOUNT",
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/?account_deleted=1");
  });
});
