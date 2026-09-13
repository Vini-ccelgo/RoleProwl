"use client";

import { useActionState } from "react";
import { decideCandidateKnowledgeProposal } from "@/app/(app)/profile/actions";
import { initialCandidateFormState } from "@/features/candidate/form-state";

export function CandidateKnowledgeReviewForm({
  proposalId,
  proposedValue,
}: {
  proposalId: string;
  proposedValue: string;
}) {
  const [state, action, pending] = useActionState(
    decideCandidateKnowledgeProposal,
    initialCandidateFormState,
  );
  return (
    <form action={action} className="candidate-knowledge-review-form">
      <input name="proposalId" type="hidden" value={proposalId} />
      <label className="field">
        <span>Reusable value</span>
        <textarea name="correctedValue" defaultValue={proposedValue} rows={3} />
      </label>
      <div className="candidate-knowledge-review-actions">
        <button
          className="button button-primary"
          disabled={pending}
          name="decision"
          type="submit"
          value="APPROVE"
        >
          Approve
        </button>
        <button
          className="button button-secondary"
          disabled={pending}
          name="decision"
          type="submit"
          value="CORRECT"
        >
          Save correction
        </button>
        <button
          className="button button-secondary"
          disabled={pending}
          name="decision"
          type="submit"
          value="DECLINE"
        >
          Decline reuse
        </button>
      </div>
      <p className={`form-message ${state.status}`} aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
