import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_DELETION_CONFIRMATION, deleteAccount } from "./delete-account";

function dependencies() {
  return {
    repository: {
      begin: vi.fn(async () => ({
        requestId: "request-1",
        externalAuthId: "clerk-1",
        storageKeys: ["documents/a", "resumes/b"],
      })),
      deleteRoleProwlData: vi.fn(async () => undefined),
      markCleanupRequired: vi.fn(async () => undefined),
      markComplete: vi.fn(async () => undefined),
    },
    storage: {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(async () => undefined),
    },
    identity: { deleteIdentity: vi.fn(async () => undefined) },
  };
}

describe("controlled account deletion", () => {
  it("requires the exact destructive confirmation", async () => {
    const deps = dependencies();
    await expect(
      deleteAccount({
        ...deps,
        userId: "user-1",
        confirmation: "delete",
      }),
    ).rejects.toThrow(ACCOUNT_DELETION_CONFIRMATION);
    expect(deps.repository.begin).not.toHaveBeenCalled();
  });

  it("cleans storage and identity before removing RoleProwl data", async () => {
    const deps = dependencies();
    await expect(
      deleteAccount({
        ...deps,
        userId: "user-1",
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      }),
    ).resolves.toEqual({ status: "COMPLETE" });
    expect(deps.repository.deleteRoleProwlData).toHaveBeenCalled();
    expect(deps.storage.delete).toHaveBeenCalledTimes(2);
    expect(deps.identity.deleteIdentity).toHaveBeenCalledWith("clerk-1");
    expect(deps.repository.markComplete).toHaveBeenCalledWith("request-1");
    expect(
      deps.identity.deleteIdentity.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.repository.deleteRoleProwlData.mock.invocationCallOrder[0],
    );
    expect(deps.storage.delete.mock.invocationCallOrder[0]).toBeLessThan(
      deps.repository.deleteRoleProwlData.mock.invocationCallOrder[0],
    );
  });

  it("does not delete identity or RoleProwl data when private storage cleanup fails", async () => {
    const deps = dependencies();
    deps.storage.delete.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(
      deleteAccount({
        ...deps,
        userId: "user-1",
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      }),
    ).resolves.toEqual({ status: "CLEANUP_REQUIRED" });
    expect(deps.identity.deleteIdentity).not.toHaveBeenCalled();
    expect(deps.repository.deleteRoleProwlData).not.toHaveBeenCalled();
    expect(deps.repository.markCleanupRequired).toHaveBeenCalledWith({
      requestId: "request-1",
      code: "EXTERNAL_CLEANUP_REQUIRED",
    });
  });

  it("retains a cleanup request if an external cleanup step fails", async () => {
    const deps = dependencies();
    deps.identity.deleteIdentity.mockRejectedValueOnce(
      new Error("unavailable"),
    );
    await expect(
      deleteAccount({
        ...deps,
        userId: "user-1",
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      }),
    ).resolves.toEqual({ status: "CLEANUP_REQUIRED" });
    expect(deps.repository.markCleanupRequired).toHaveBeenCalledWith({
      requestId: "request-1",
      code: "EXTERNAL_CLEANUP_REQUIRED",
    });
    expect(deps.repository.deleteRoleProwlData).not.toHaveBeenCalled();
  });
});
