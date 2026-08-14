import { connection } from "next/server";
import type { MatchEvidence } from "@/core/domain/matching/match-job";
import { PageHeader } from "@/components/ui/page-header";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import {
  analyzeJobAction,
  openEmployerPostingAction,
  recordMatchFeedbackAction,
  setJobDispositionAction,
} from "./actions";

function evidence(value: unknown): MatchEvidence[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is MatchEvidence =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as MatchEvidence).code === "string" &&
          typeof (item as MatchEvidence).label === "string" &&
          typeof (item as MatchEvidence).evidence === "string",
      )
    : [];
}

function EvidenceGroup({
  title,
  items,
}: {
  title: string;
  items: MatchEvidence[];
}) {
  if (!items.length) return null;
  return (
    <div className="grid gap-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="m-0 grid gap-1 pl-5 text-sm text-foreground-muted">
        {items.map((item) => (
          <li key={`${title}-${item.code}`}>
            <span className="text-foreground">{item.label}:</span>{" "}
            {item.evidence}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function JobsPage() {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const jobs = await databaseClient().job.findMany({
    where: { status: "ACTIVE" },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
    include: {
      sourceRecords: { orderBy: { lastSeenAt: "desc" }, take: 1 },
      matchAnalyses: {
        where: { userId: actor.id, scoringVersion: "match-v1.0" },
        include: { feedback: { where: { userId: actor.id } } },
        take: 1,
      },
      candidateDispositions: { where: { userId: actor.id }, take: 1 },
    },
  });

  return (
    <div className="grid gap-7">
      <PageHeader
        title="Jobs and fit analysis"
        description="Every score is separated into qualification, preference, conflicts, and source evidence."
      />
      {jobs.length === 0 ? (
        <div className="card p-8 text-sm text-foreground-muted">
          No active jobs have been ingested from configured sources yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const analysis = job.matchAnalyses[0];
            const groups = analysis
              ? {
                  conflicts: evidence(analysis.hardConflicts),
                  strengths: evidence(analysis.strengths),
                  partials: evidence(analysis.partialMatches),
                  gaps: evidence(analysis.gaps),
                  unknowns: evidence(analysis.unknowns),
                }
              : null;
            const scoreEvidenceCount = groups
              ? groups.conflicts.length +
                groups.strengths.length +
                groups.partials.length +
                groups.gaps.length
              : 0;
            const source = job.sourceRecords[0];
            const disposition = job.candidateDispositions[0]?.status;
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
                  {analysis && scoreEvidenceCount > 0 ? (
                    <div className="text-right">
                      <strong className="text-2xl text-brand">
                        {analysis.overallFit}
                      </strong>
                      <p className="m-0 text-xs">
                        overall fit · {Math.round(analysis.confidence * 100)}%
                        confidence
                      </p>
                    </div>
                  ) : (
                    <span className="badge">
                      Not enough evidence for a score
                    </span>
                  )}
                </div>
                {analysis && groups ? (
                  <div className="grid gap-4">
                    {scoreEvidenceCount > 0 && (
                      <p className="m-0 text-sm">
                        Qualification {analysis.qualificationScore}/100 ·
                        Preference {analysis.preferenceScore}/100 ·{" "}
                        {analysis.scoringVersion}
                      </p>
                    )}
                    <EvidenceGroup
                      title="Hard conflicts"
                      items={groups.conflicts}
                    />
                    <EvidenceGroup
                      title="Strong matches"
                      items={groups.strengths}
                    />
                    <EvidenceGroup
                      title="Partial matches"
                      items={groups.partials}
                    />
                    <EvidenceGroup title="Gaps" items={groups.gaps} />
                    <EvidenceGroup title="Unknowns" items={groups.unknowns} />
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
                ) : (
                  <form action={analyzeJobAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <button className="button button-primary" type="submit">
                      Analyze my fit
                    </button>
                  </form>
                )}
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
                <div className="flex flex-wrap gap-2">
                  {(["SHORTLISTED", "REJECTED"] as const).map((status) => (
                    <form action={setJobDispositionAction} key={status}>
                      <input name="jobId" type="hidden" value={job.id} />
                      <button
                        className={
                          disposition === status
                            ? "badge"
                            : "button button-secondary"
                        }
                        name="status"
                        type="submit"
                        value={status}
                      >
                        {status === "SHORTLISTED" ? "Shortlist" : "Reject"}
                      </button>
                    </form>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
