import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    user: {
      updateMany: mocks.updateMany,
      upsert: mocks.upsert,
    },
  })),
}));

import { PrismaUserAccountRepository } from "./prisma-user-account-repository";

describe("PrismaUserAccountRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes only a matching identity that is still active", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const repository = new PrismaUserAccountRepository();

    await repository.refreshActiveIdentity({
      provider: "CLERK",
      externalId: "user_synthetic",
      email: "updated@example.test",
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        authProvider: "CLERK",
        externalAuthId: "user_synthetic",
        deletedAt: null,
      },
      data: { email: "updated@example.test" },
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("treats a missing or deleted local identity as a no-op", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const repository = new PrismaUserAccountRepository();

    await expect(
      repository.refreshActiveIdentity({
        provider: "CLERK",
        externalId: "user_deleted",
        email: "delayed@example.test",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.updateMany).toHaveBeenCalledOnce();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
