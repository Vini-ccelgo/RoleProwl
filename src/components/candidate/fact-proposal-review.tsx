"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { getProposalDestination } from "@/core/domain/candidate/proposal-destinations";
import { availableProposalActions } from "@/core/domain/candidate/proposal-review-state";

interface ProposalSummary {
  readonly confidence: number | null;
  readonly factType: string;
  readonly id: string;
  readonly sourceText: string;
  readonly supported: boolean;
  readonly value: string;
}

export function FactProposalReview({
  proposals,
}: {
  proposals: ProposalSummary[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string>();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();

  async function decide(
    proposal: ProposalSummary,
    decision: "ACCEPT" | "EDIT_AND_ACCEPT" | "REJECT",
  ) {
    setBusyId(proposal.id);
    setMessage(undefined);
    try {
      const response = await fetch(
        `/api/candidate/fact-proposals/${proposal.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision,
            ...(decision === "EDIT_AND_ACCEPT"
              ? { editedValue: { text: edits[proposal.id] ?? proposal.value } }
              : {}),
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Review failed.");
      setMessage(
        decision === "REJECT"
          ? "Proposal rejected and retained in history."
          : "Fact accepted into your verified Truth Vault.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review failed.");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="grid gap-3" aria-labelledby="fact-review-title">
      <div>
        <h2 id="fact-review-title" className="text-lg font-semibold">
          Review extracted facts
        </h2>
        <p className="mt-1 text-sm">
          Accept, correct, or reject each suggestion. Only accepted values
          become verified facts.
        </p>
      </div>
      <p role="status" className="m-0 text-sm">
        {message}
      </p>
      {proposals.length === 0 ? (
        <div className="card p-6 text-sm text-foreground-muted">
          No pending facts need review.
        </div>
      ) : (
        proposals.map((proposal) => {
          const currentValue = edits[proposal.id] ?? proposal.value;
          const actions = availableProposalActions({
            original: proposal.value,
            current: currentValue,
            supported: proposal.supported,
          });
          const hasAction = (action: "ACCEPT" | "EDIT_AND_ACCEPT" | "REJECT") =>
            (actions as readonly string[]).includes(action);
          const destination = proposal.supported
            ? getProposalDestination(proposal.factType)
            : undefined;
          return (
            <article className="card grid gap-3 p-4" key={proposal.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">
                  {destination?.label ??
                    proposal.factType.replaceAll("_", " ").toLowerCase()}
                </strong>
                <span className="badge">
                  {proposal.confidence == null
                    ? "Unscored"
                    : `${Math.round(proposal.confidence * 100)}% parser confidence`}
                </span>
              </div>
              <label className="grid gap-1 text-xs font-medium">
                Proposed value
                <input
                  className="rounded-lg border border-border-default bg-white px-3 py-2 text-sm font-normal"
                  disabled={!proposal.supported || busyId === proposal.id}
                  value={currentValue}
                  onChange={(event) =>
                    setEdits((current) => ({
                      ...current,
                      [proposal.id]: event.target.value,
                    }))
                  }
                />
              </label>
              <p className="m-0 text-xs">
                Destination: {destination?.label ?? "Unsupported proposal type"}
                {destination ? " · Verified résumé facts" : ""}
              </p>
              {!proposal.supported && (
                <p className="m-0 text-xs text-foreground-muted">
                  This historical proposal has no supported canonical
                  destination. It can only be rejected.
                </p>
              )}
              <p className="m-0 text-xs">Source: “{proposal.sourceText}”</p>
              <div className="flex flex-wrap gap-2">
                {hasAction("ACCEPT") && (
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={busyId === proposal.id}
                    onClick={() => decide(proposal, "ACCEPT")}
                  >
                    <Check size={16} aria-hidden="true" /> Accept original
                  </button>
                )}
                {hasAction("EDIT_AND_ACCEPT") && (
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={busyId === proposal.id}
                    onClick={() => decide(proposal, "EDIT_AND_ACCEPT")}
                  >
                    <Pencil size={16} aria-hidden="true" /> Accept edited
                  </button>
                )}
                <button
                  className="button button-ghost"
                  type="button"
                  disabled={busyId === proposal.id}
                  onClick={() => decide(proposal, "REJECT")}
                >
                  <X size={16} aria-hidden="true" /> Reject
                </button>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
