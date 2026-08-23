"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  analyzeJobAction,
  setJobDispositionAction,
  startApplicationAction,
} from "@/app/(app)/jobs/actions";
import {
  jobActionHierarchy,
  type JobCardAction,
} from "@/features/jobs/job-action-hierarchy";
import {
  scheduleShortlistRefresh,
  shortlistRemovalLabel,
  showViewShortlistLink,
} from "@/features/jobs/shortlist-feedback";

export function JobCardActions({
  analysisExists,
  applicationId,
  disposition,
  jobId,
  preparationAvailable,
  view,
}: {
  readonly analysisExists: boolean;
  readonly applicationId?: string;
  readonly disposition?: "REJECTED" | "SHORTLISTED";
  readonly jobId: string;
  readonly preparationAvailable: boolean;
  readonly view: "active" | "all" | "rejected" | "shortlisted";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [transientShortlist, setTransientShortlist] = useState(false);
  const shortlisted = disposition === "SHORTLISTED" || transientShortlist;
  const hierarchy = jobActionHierarchy({
    analyzed: analysisExists,
    applicationExists: Boolean(applicationId),
    disposition: shortlisted
      ? "SHORTLISTED"
      : disposition === "REJECTED"
        ? "REJECTED"
        : null,
    preparationAvailable,
  });

  useEffect(() => {
    if (!transientShortlist) return;
    return scheduleShortlistRefresh(() => router.refresh());
  }, [router, transientShortlist]);

  function setDisposition(
    status: "REJECTED" | "SHORTLISTED" | "UNDECIDED",
    transient = false,
  ) {
    const undoingTransientShortlist =
      status === "UNDECIDED" && transientShortlist;
    if (undoingTransientShortlist) setTransientShortlist(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("jobId", jobId);
      formData.set("status", status);
      if (transient) formData.set("feedbackMode", "transient");
      try {
        await setJobDispositionAction(formData);
        setTransientShortlist(status === "SHORTLISTED");
        if (status !== "SHORTLISTED") router.refresh();
      } catch {
        if (undoingTransientShortlist) setTransientShortlist(true);
        router.refresh();
      }
    });
  }

  function action(actionId: JobCardAction, primary: boolean) {
    const className = primary
      ? "button button-primary"
      : "button button-secondary";
    if (actionId === "ANALYZE_FIT")
      return (
        <form action={analyzeJobAction} key={actionId}>
          <input name="jobId" type="hidden" value={jobId} />
          <button className={className} type="submit">
            Analyze fit
          </button>
        </form>
      );
    if (actionId === "REVIEW_FIT")
      return (
        <Link className={className} href={`/jobs/${jobId}`} key={actionId}>
          Review fit
        </Link>
      );
    if (actionId === "PREPARE_APPLICATION")
      return (
        <form action={startApplicationAction} key={actionId}>
          <input name="jobId" type="hidden" value={jobId} />
          <button className={className} type="submit">
            Prepare application
          </button>
        </form>
      );
    if (actionId === "CONTINUE_APPLICATION" && applicationId)
      return (
        <Link
          className={className}
          href={`/applications/${applicationId}`}
          key={actionId}
        >
          Continue application
        </Link>
      );
    if (actionId === "SHORTLIST")
      return (
        <button
          className={className}
          disabled={pending}
          key={actionId}
          onClick={() => setDisposition("SHORTLISTED", true)}
          type="button"
        >
          Shortlist
        </button>
      );
    if (actionId === "NOT_PURSUING")
      return (
        <button
          className={className}
          disabled={pending}
          key={actionId}
          onClick={() => setDisposition("REJECTED")}
          type="button"
        >
          Not pursuing
        </button>
      );
    if (actionId === "RECONSIDER")
      return (
        <button
          className={className}
          disabled={pending}
          key={actionId}
          onClick={() => setDisposition("UNDECIDED")}
          type="button"
        >
          Reconsider
        </button>
      );
    if (actionId === "REMOVE_FROM_SHORTLIST")
      return (
        <button
          className={className}
          disabled={pending}
          key={actionId}
          onClick={() => setDisposition("UNDECIDED")}
          type="button"
        >
          {shortlistRemovalLabel(transientShortlist)}
        </button>
      );
    return null;
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {hierarchy.primary.map((item) => action(item, true))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {shortlisted && (
          <span className="text-sm font-semibold text-brand" role="status">
            Shortlisted
          </span>
        )}
        {hierarchy.secondary.map((item) => action(item, false))}
        {shortlisted && showViewShortlistLink(view, transientShortlist) && (
          <Link
            className="text-sm font-semibold text-brand"
            href="/jobs?view=shortlisted"
          >
            View shortlist →
          </Link>
        )}
      </div>
    </div>
  );
}
