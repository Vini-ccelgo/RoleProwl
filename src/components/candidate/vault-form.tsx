"use client";

import { useActionState, useEffect, useRef } from "react";
import type { CandidateFormState } from "@/features/candidate/form-state";
import { initialCandidateFormState } from "@/features/candidate/form-state";
import { cn } from "@/lib/cn";

type CandidateAction = (
  state: CandidateFormState,
  formData: FormData,
) => Promise<CandidateFormState>;

export function VaultForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  submitLabel = "Save",
}: {
  action: CandidateAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  submitLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    action,
    initialCandidateFormState,
  );

  useEffect(() => {
    if (resetOnSuccess && state.status === "success") formRef.current?.reset();
  }, [resetOnSuccess, state.status]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn("vault-form", className)}
    >
      <div className="vault-form-grid">{children}</div>
      <div className="vault-form-footer">
        <p className={`form-message ${state.status}`} aria-live="polite">
          {state.message}
        </p>
        <button
          className="button button-primary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
