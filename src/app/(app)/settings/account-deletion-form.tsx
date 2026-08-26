"use client";

import { useClerk } from "@clerk/nextjs";
import { useActionState, useEffect, useRef, useState } from "react";
import type { AccountDeletionActionState } from "./actions";

export const INITIAL_ACCOUNT_DELETION_STATE: AccountDeletionActionState = {
  status: "idle",
};

export const ACCOUNT_DELETED_DESTINATION = "/?account_deleted=1";

export async function finalizeCompletedAccountDeletion(
  signOut: (options: { redirectUrl: string }) => Promise<void>,
) {
  await signOut({ redirectUrl: ACCOUNT_DELETED_DESTINATION });
}

export function AccountDeletionForm({
  action,
}: {
  readonly action: (
    state: AccountDeletionActionState,
    formData: FormData,
  ) => Promise<AccountDeletionActionState>;
}) {
  const clerk = useClerk();
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ACCOUNT_DELETION_STATE,
  );
  const finalizationStarted = useRef(false);
  const [finalizationFailed, setFinalizationFailed] = useState(false);

  useEffect(() => {
    if (state.status !== "complete" || finalizationStarted.current) return;
    finalizationStarted.current = true;
    void finalizeCompletedAccountDeletion((options) =>
      clerk.signOut(options),
    ).catch(() => {
      finalizationStarted.current = false;
      setFinalizationFailed(true);
    });
  }, [clerk, state.status]);

  if (state.status === "complete")
    return (
      <div className="grid gap-3" role="status">
        <p className="m-0 text-sm">
          Your RoleProwl account was deleted. Finishing secure sign-out…
        </p>
        {finalizationFailed ? (
          <button
            className="button button-secondary w-fit"
            onClick={() => {
              setFinalizationFailed(false);
              finalizationStarted.current = true;
              void finalizeCompletedAccountDeletion((options) =>
                clerk.signOut(options),
              ).catch(() => {
                finalizationStarted.current = false;
                setFinalizationFailed(true);
              });
            }}
            type="button"
          >
            Retry secure sign-out
          </button>
        ) : null}
      </div>
    );

  return (
    <form action={formAction} className="grid max-w-xl gap-3">
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
    </form>
  );
}
