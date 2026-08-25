import { connection } from "next/server";
import Link from "next/link";
import { MatchAnalysisSummary } from "@/components/jobs/match-analysis-summary";
import { JobCardActions } from "@/components/jobs/job-card-actions";
import { PageHeader } from "@/components/ui/page-header";
import {
  candidateDispositionLabel,
  JOB_DISPOSITION_FILTERS,
  parseJobDispositionView,
} from "@/core/domain/jobs/job-disposition";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { candidateJobCatalogQuery } from "@/features/jobs/candidate-job-catalog";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import {
  openEmployerPostingAction,
  recordMatchFeedbackAction,
} from "./actions";

export default async function JobsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly view?: string | string[] }>;
}) {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const rawView = (await searchParams).view;
  const view = parseJobDispositionView(
    Array.isArray(rawView) ? rawView[0] : rawView,
  );
  const jobs = await databaseClient().job.findMany(
    candidateJobCatalogQuery(actor.id, view),
  );

  return (
    <div className="grid gap-7">
      <PageHeader
        title="Jobs and fit analysis"
        description="Candidate decisions, assessed fit, and missing evidence remain explicit and under your control."
      />
      <nav
        aria-label="Job disposition filters"
        className="flex flex-wrap gap-2"
      >
        {JOB_DISPOSITION_FILTERS.map(([value, label]) => (
          <Link
            aria-current={view === value ? "page" : undefined}
            className={
              view === value
                ? "button button-primary"
                : "button button-secondary"
            }
            href={value === "active" ? "/jobs" : `/jobs?view=${value}`}
            key={value}
          >
            {label}
          </Link>
        ))}
      </nav>
      {jobs.length === 0 ? (
        <div className="card p-8 text-sm text-foreground-muted">
          No jobs are in this view.
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const analysis = job.matchAnalyses[0];
            const source = job.sourceRecords[0];
            const disposition = job.candidateDispositions[0]?.status;
            const application = job.applications[0];
            const feedback = analysis?.feedback.find(
              (item) => item.signalCode === "OVERALL",
            );
            return (
              <article className="card grid gap-4 p-5" key={job.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{job.title}</h2>
                    <p className="m-0 text-sm">
                      {job.company}
                      {job.locations && Array.isArray(job.locations)
                        ? ` · ${job.locations.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <span className="badge">
                    {candidateDispositionLabel(disposition ?? null)}
                  </span>
                </div>
                {analysis ? (
                  <div className="grid gap-4">
                    <MatchAnalysisSummary analysis={analysis} />
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span>Was this analysis useful?</span>
                      {(
                        ["ACCURATE", "INACCURATE", "NOT_RELEVANT"] as const
                      ).map((rating) => (
                        <form action={recordMatchFeedbackAction} key={rating}>
                          <input
                            type="hidden"
                            name="analysisId"
                            value={analysis.id}
                          />
                          <input
                            type="hidden"
                            name="signalCode"
                            value="OVERALL"
                          />
                          <button
                            className={
                              feedback?.rating === rating
                                ? "badge"
                                : "button button-ghost"
                            }
                            name="rating"
                            value={rating}
                            type="submit"
                          >
                            {rating.replaceAll("_", " ").toLowerCase()}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                ) : null}
                {source?.applicationUrl && (
                  <form action={openEmployerPostingAction}>
                    <input name="jobId" type="hidden" value={job.id} />
                    <button
                      className="text-sm font-semibold text-brand"
                      type="submit"
                    >
                      Open employer posting →
                    </button>
                  </form>
                )}
                <JobCardActions
                  analysisExists={Boolean(analysis)}
                  applicationId={application?.id}
                  disposition={disposition}
                  jobId={job.id}
                  preparationAvailable={Boolean(source?.applicationUrl)}
                  view={view}
                />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
