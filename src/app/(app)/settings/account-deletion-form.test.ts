import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETED_DESTINATION,
  finalizeCompletedAccountDeletion,
} from "./account-deletion-form";

describe("account deletion browser finalization", () => {
  it("uses Clerk sign-out before navigating to the deletion confirmation", async () => {
    const signOut = vi.fn(async () => undefined);
    await finalizeCompletedAccountDeletion(signOut);
    expect(signOut).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith({
      redirectUrl: "/?account_deleted=1",
    });
    expect(ACCOUNT_DELETED_DESTINATION).toBe("/?account_deleted=1");
  });

  it("does not reinterpret failed session finalization as success", async () => {
    const failure = new Error("Clerk unavailable");
    await expect(
      finalizeCompletedAccountDeletion(
        vi.fn(async () => Promise.reject(failure)),
      ),
    ).rejects.toBe(failure);
  });
});
