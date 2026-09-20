"use client";

import { useActionState, useState } from "react";
import type { CandidateFormState } from "@/features/candidate/form-state";
import { initialCandidateFormState } from "@/features/candidate/form-state";

type CandidateAction = (
  state: CandidateFormState,
  formData: FormData,
) => Promise<CandidateFormState>;

export function CandidateKnowledgeRemovalForm({
  action,
  concept,
}: {
  readonly action: CandidateAction;
  readonly concept: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    action,
    initialCandidateFormState,
  );

  if (!confirming)
    return (
      <div
        className="candidate-knowledge-remove"
        data-requires-confirmation="true"
      >
        <button
          className="button button-danger-text"
          onClick={() => setConfirming(true)}
          type="button"
        >
          Remove saved answer
        </button>
      </div>
    );

  return (
    <form
      action={formAction}
      className="candidate-knowledge-remove-confirmation"
    >
      <input name="concept" type="hidden" value={concept} />
      <p className="m-0 text-xs">
        Remove this reusable answer? Future applications may ask for it again.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="button button-secondary"
          disabled={pending}
          onClick={() => setConfirming(false)}
          type="button"
        >
          Cancel
        </button>
        <button
          className="button button-danger"
          disabled={pending}
          type="submit"
        >
          {pending ? "Removing…" : "Confirm removal"}
        </button>
      </div>
      <p className={`form-message ${state.status}`} aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
