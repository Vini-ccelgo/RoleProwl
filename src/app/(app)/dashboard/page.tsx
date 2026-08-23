import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { DASHBOARD_RECORDS_DESCRIPTION } from "@/components/dashboard/dashboard-copy";
import {
  MINIMUM_HIGH_FIT_EVIDENCE_COVERAGE,
  hasSufficientEvidenceForHighFit,
} from "@/core/domain/matching/match-job";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import {
  preparedApplicationsWhere,
  submittedApplicationsWhere,
} from "@/features/applications/application-metrics";
import {
  activeEvidenceAwareMatchWhere,
  confirmedHighFitWhere,
} from "@/features/jobs/match-query-policy";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";

const METRICS = [
  { key: "relevant", label: "Relevant jobs", href: "/jobs" },
  { key: "highFit", label: "Confirmed high-fit jobs", href: "/jobs" },
  { key: "prepared", label: "Prepared applications", href: "/applications" },
  { key: "review", label: "Needs review", href: "/queue" },
  { key: "submitted", label: "Submitted", href: "/applications" },
  { key: "responses", label: "Responses", href: "/applications" },
  { key: "interviews", label: "Interviews", href: "/applications" },
] as const;

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export default async function DashboardPage() {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const database = databaseClient();
  const policy = await database.applicationPolicy.findUnique({
    where: { userId: actor.id },
    select: { minimumOverallFit: true },
  });
  const highFitThreshold = policy?.minimumOverallFit ?? 70;
  const [
    relevant,
    highFit,
    prepared,
    review,
    submitted,
    responses,
    interviews,
    topMatches,
    recentActivity,
  ] = await Promise.all([
    database.jobMatchAnalysis.count({
      where: activeEvidenceAwareMatchWhere(actor.id),
    }),
    database.jobMatchAnalysis.count({
      where: confirmedHighFitWhere(actor.id, highFitThreshold),
    }),
    database.application.count({
      where: preparedApplicationsWhere(actor.id),
    }),
    database.reviewQueueItem.count({
      where: { userId: actor.id, status: { in: ["PENDING", "DEFERRED"] } },
    }),
    database.application.count({
      where: submittedApplicationsWhere(actor.id),
    }),
    database.application.count({
      where: { userId: actor.id, state: "RESPONSE" },
    }),
    database.application.count({
      where: { userId: actor.id, state: "INTERVIEW" },
    }),
    database.jobMatchAnalysis.findMany({
      where: activeEvidenceAwareMatchWhere(actor.id),
      orderBy: [{ overallFit: "desc" }, { updatedAt: "desc" }],
      take: 5,
      include: {
        job: { select: { id: true, company: true, title: true } },
      },
    }),
    database.applicationEvent.findMany({
      where: { application: { userId: actor.id } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        application: {
          select: {
            id: true,
            job: { select: { company: true, title: true } },
          },
        },
      },
    }),
  ]);
  const metrics = {
    relevant,
    highFit,
    prepared,
    review,
    submitted,
    responses,
    interviews,
  };

  return (
    <div className="grid gap-7">
      <PageHeader
        title="Your job search, organized"
        description={DASHBOARD_RECORDS_DESCRIPTION}
      />

      <section
        aria-label="Current totals"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {METRICS.map((metric) => (
          <Link
            className="card p-4 transition hover:border-brand"
            href={metric.href}
            key={metric.key}
          >
            <strong className="text-2xl text-brand">
              {metrics[metric.key]}
            </strong>
            <p className="m-0 text-sm font-semibold text-foreground">
              {metric.label}
            </p>
          </Link>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card grid content-start gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Top job matches</h2>
              <p className="m-0 text-sm">
                High fit requires your {highFitThreshold}% threshold and at
                least {MINIMUM_HIGH_FIT_EVIDENCE_COVERAGE * 100}% evidence
                coverage.
              </p>
            </div>
            <Link className="text-sm font-semibold text-brand" href="/jobs">
              View jobs →
            </Link>
          </div>
          {topMatches.length === 0 ? (
            <div className="border-border rounded-xl border p-4 text-sm text-foreground-muted">
              No jobs have a fit analysis yet. Open Jobs to analyze ingested
              opportunities against your verified profile.
            </div>
          ) : (
            <ol className="m-0 grid list-none gap-3 p-0">
              {topMatches.map((match) => (
                <li
                  className="border-border flex items-start justify-between gap-4 rounded-xl border p-3"
                  key={match.id}
                >
                  <div>
                    <strong>{match.job.title}</strong>
                    <p className="m-0 text-sm">{match.job.company}</p>
                  </div>
                  <div className="text-right">
                    <span className="badge">
                      {hasSufficientEvidenceForHighFit(match.confidence)
                        ? `${match.overallFit}% fit`
                        : "Preliminary fit"}
                    </span>
                    <p className="m-0 text-xs text-foreground-muted">
                      {Math.round(match.confidence * 100)}% evidence coverage
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card grid content-start gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                Recent application activity
              </h2>
              <p className="m-0 text-sm">
                Newest durable history events first.
              </p>
            </div>
            <Link
              className="text-sm font-semibold text-brand"
              href="/applications"
            >
              View tracker →
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <div className="border-border rounded-xl border p-4 text-sm text-foreground-muted">
              No application activity is recorded. Prepared or reviewed
              applications will appear here automatically.
            </div>
          ) : (
            <ol className="m-0 grid list-none gap-3 p-0">
              {recentActivity.map((event) => (
                <li
                  className="border-border rounded-xl border p-3"
                  key={event.id}
                >
                  <Link
                    className="font-semibold"
                    href={`/applications/${event.application.id}`}
                  >
                    {label(event.type)}
                  </Link>
                  <p className="m-0 text-sm">
                    {event.application.job.title} ·{" "}
                    {event.application.job.company}
                  </p>
                  <time
                    className="text-xs text-foreground-muted"
                    dateTime={event.createdAt.toISOString()}
                  >
                    {event.createdAt.toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
