"use client";

import { Search } from "lucide-react";
import { useActionState } from "react";
import {
  runJobSearchAction,
  type JobSearchActionState,
} from "@/app/actions/job-search";

const initialState: JobSearchActionState = { status: "idle" };

export function SearchControl({
  active = false,
  lastRun,
}: {
  active?: boolean;
  lastRun?: {
    status: "RUNNING" | "COMPLETED" | "FAILED";
    startedAt: string;
    completedAt: string | null;
    discoveredCount: number;
    newCount: number;
    failureMessage: string | null;
  } | null;
}) {
  const [state, action, pending] = useActionState(
    runJobSearchAction,
    initialState,
  );
  const persistedRunning = lastRun?.status === "RUNNING" && active;
  const status = pending || persistedRunning ? "running" : state.status;
  const disabled = pending || persistedRunning;
  const completed = state.status === "success" ? state : lastRun;

  return (
    <section className="card search-control" aria-live="polite">
      <div>
        <p className="eyebrow">Candidate-controlled discovery</p>
        <h2>Find current opportunities</h2>
        <p>
          Search configured public job boards now. This discovers and
          deduplicates listings only; it never submits an application.
        </p>
      </div>
      <form action={action}>
        <button
          className="button button-primary"
          disabled={disabled}
          type="submit"
        >
          <Search size={18} />
          {disabled ? "Search running…" : "Search now"}
        </button>
      </form>
      <div className="search-status" data-status={status}>
        {pending && <p>Starting and checking configured sources…</p>}
        {!pending && persistedRunning && <p>A search is currently running…</p>}
        {!pending && state.message && <p>{state.message}</p>}
        {!pending &&
          state.status === "idle" &&
          lastRun?.status === "FAILED" && (
            <p>
              {lastRun.failureMessage ??
                "The last search failed. You can retry safely."}
            </p>
          )}
        {completed?.status === "COMPLETED" || state.status === "success" ? (
          <p>
            {completed?.discoveredCount ?? 0} discovered ·{" "}
            {completed?.newCount ?? 0} new
          </p>
        ) : null}
        {lastRun && (
          <small>
            Last started {new Date(lastRun.startedAt).toLocaleString()}
            {lastRun.completedAt
              ? ` · finished ${new Date(lastRun.completedAt).toLocaleString()}`
              : ""}
          </small>
        )}
      </div>
    </section>
  );
}
