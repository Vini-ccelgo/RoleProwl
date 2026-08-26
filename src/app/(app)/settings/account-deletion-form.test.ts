import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_PENDING_DESTINATION,
  ACCOUNT_DELETED_DESTINATION,
  finalizeAccountDeletionTransport,
  finalizeCompletedAccountDeletion,
  requestAccountDeletion,
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

  it("exposes a bounded secure sign-out retry without manipulating cookies", () => {
    const source = readFileSync(
      "src/app/(app)/settings/account-deletion-form.tsx",
      "utf8",
    );

    expect(source).toContain("Retry secure sign-out");
    expect(source).toContain("setFinalizationFailed(true)");
    expect(source).not.toContain("document.cookie");
  });

  it("posts only the typed confirmation to the dedicated deletion endpoint", async () => {
    const request = vi.fn(async () =>
      Response.json({ status: "COMPLETE" as const }),
    );

    await expect(
      requestAccountDeletion("DELETE ROLEPROWL ACCOUNT", request),
    ).resolves.toBe("COMPLETE");
    expect(request).toHaveBeenCalledWith("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE ROLEPROWL ACCOUNT" }),
    });
  });

  it("signs out only after complete deletion", async () => {
    const navigate = vi.fn();
    const signOut = vi.fn(async () => undefined);

    await finalizeAccountDeletionTransport("COMPLETE", {
      navigate,
      signOut,
    });

    expect(signOut).toHaveBeenCalledWith({
      redirectUrl: ACCOUNT_DELETED_DESTINATION,
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates cleanup-required deletion without claiming sign-out completion", async () => {
    const navigate = vi.fn();
    const signOut = vi.fn(async () => undefined);

    await finalizeAccountDeletionTransport("CLEANUP_REQUIRED", {
      navigate,
      signOut,
    });

    expect(navigate).toHaveBeenCalledWith(ACCOUNT_DELETION_PENDING_DESTINATION);
    expect(signOut).not.toHaveBeenCalled();
  });
});
