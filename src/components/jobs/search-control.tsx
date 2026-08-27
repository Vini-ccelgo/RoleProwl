"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  runJobSearchAction,
  type JobSearchActionState,
} from "@/app/actions/job-search";

const initialState: JobSearchActionState = { status: "idle" };

export function SearchControl({
  active = false,
  directedCriteriaReady = true,
  lastRun,
}: {
  active?: boolean;
  directedCriteriaReady?: boolean;
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
          Search configured public job boards using your saved role-family and
          optional location preferences. This discovers and deduplicates
          listings only; it never submits an application or claims they are
          personalized matches.
        </p>
      </div>
      {directedCriteriaReady ? (
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
      ) : (
        <Link
          className="button button-primary w-fit"
          href="/profile#preferences"
        >
          Add a role preference
        </Link>
      )}
      <div className="search-status" data-status={status}>
        {!directedCriteriaReady && (
          <p>
            Add at least one role family in Job preferences before starting
            candidate-directed discovery. Location is optional.
          </p>
        )}
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
