"use client";

import { useClerk } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";

export const ACCOUNT_DELETED_DESTINATION = "/?account_deleted=1";
export const ACCOUNT_DELETION_PENDING_DESTINATION =
  "/?account_deletion_pending=1";

export async function finalizeCompletedAccountDeletion(
  signOut: (options: { redirectUrl: string }) => Promise<void>,
) {
  await signOut({ redirectUrl: ACCOUNT_DELETED_DESTINATION });
}

export async function finalizeAccountDeletionTransport(
  status: "COMPLETE" | "CLEANUP_REQUIRED",
  options: {
    readonly navigate: (destination: string) => void;
    readonly signOut: (options: { redirectUrl: string }) => Promise<void>;
  },
) {
  if (status === "CLEANUP_REQUIRED") {
    options.navigate(ACCOUNT_DELETION_PENDING_DESTINATION);
    return;
  }
  await finalizeCompletedAccountDeletion(options.signOut);
}

export async function requestAccountDeletion(
  confirmation: string,
  request: typeof fetch = fetch,
) {
  const response = await request("/api/account/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
  const result = (await response.json()) as {
    error?: string;
    status?: "COMPLETE" | "CLEANUP_REQUIRED";
  };
  if (!response.ok)
    throw new Error(result.error ?? "The account could not be deleted.");
  if (result.status !== "COMPLETE" && result.status !== "CLEANUP_REQUIRED")
    throw new Error("The account deletion response was invalid.");
  return result.status;
}

export function AccountDeletionForm() {
  const clerk = useClerk();
  const [finalizationFailed, setFinalizationFailed] = useState(false);
  const [deletionComplete, setDeletionComplete] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function finalizeSession() {
    setFinalizationFailed(false);
    try {
      await finalizeAccountDeletionTransport("COMPLETE", {
        navigate: (destination) => window.location.assign(destination),
        signOut: (options) => clerk.signOut(options),
      });
    } catch {
      setFinalizationFailed(true);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(undefined);
    const formData = new FormData(event.currentTarget);
    try {
      const status = await requestAccountDeletion(
        String(formData.get("confirmation") ?? ""),
      );
      if (status === "CLEANUP_REQUIRED") {
        await finalizeAccountDeletionTransport(status, {
          navigate: (destination) => window.location.assign(destination),
          signOut: (options) => clerk.signOut(options),
        });
        return;
      }
      setDeletionComplete(true);
      await finalizeSession();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The account could not be deleted.",
      );
    } finally {
      setPending(false);
    }
  }

  if (deletionComplete)
    return (
      <div className="grid gap-3" role="status">
        <p className="m-0 text-sm">
          Your RoleProwl account was deleted. Finishing secure sign-out…
        </p>
        {finalizationFailed ? (
          <button
            className="button button-secondary w-fit"
            onClick={() => {
              void finalizeSession();
            }}
            type="button"
          >
            Retry secure sign-out
          </button>
        ) : null}
      </div>
    );

  return (
    <form className="grid max-w-xl gap-3" onSubmit={submit}>
      <label className="field">
        <span>Type DELETE ROLEPROWL ACCOUNT</span>
        <input autoComplete="off" name="confirmation" required type="text" />
      </label>
      <button
        className="button w-fit border-danger text-danger"
        disabled={pending}
        type="submit"
      >
        {pending ? "Deleting account…" : "Permanently delete account"}
      </button>
      <p className="m-0 text-sm" role="status">
        {message}
      </p>
    </form>
  );
}
