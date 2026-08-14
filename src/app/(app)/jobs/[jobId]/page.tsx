import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { JsonSnapshot } from "@/components/applications/json-snapshot";
import { PageHeader } from "@/components/ui/page-header";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";

function Unknown({ value }: { readonly value: React.ReactNode }) {
  return value == null || value === "" ? (
    <span className="text-foreground-muted">Unknown</span>
  ) : (
    value
  );
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const { jobId } = await params;
  const job = await databaseClient().job.findFirst({
    where: { id: jobId, status: "ACTIVE" },
    include: {
      sourceRecords: {
        orderBy: { lastSeenAt: "desc" },
        select: {
          source: true,
          sourceUrl: true,
          applicationUrl: true,
          lastVerifiedAt: true,
        },
      },
      matchAnalyses: {
        where: { userId: actor.id, scoringVersion: "match-v1.0" },
        take: 1,
      },
      candidateDispositions: { where: { userId: actor.id }, take: 1 },
    },
  });
  if (!job) notFound();
  const analysis = job.matchAnalyses[0];

  return (
    <div className="grid gap-7">
      <PageHeader
        title={job.title}
        description={`${job.company} · canonical job record`}
      />
      <p className="m-0">
        <Link className="text-sm font-semibold text-brand" href="/jobs">
          ← Back to jobs
        </Link>
      </p>
      <section className="card grid gap-4 p-5">
        <h2 className="text-lg font-semibold">Role facts</h2>
        <dl className="m-0 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-foreground-muted">Location</dt>
            <dd className="m-0">
              <Unknown
                value={
                  Array.isArray(job.locations) ? job.locations.join(", ") : null
                }
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Work mode</dt>
            <dd className="m-0">
              <Unknown value={job.remoteType} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Employment</dt>
            <dd className="m-0">
              <Unknown value={job.employmentType} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Seniority</dt>
            <dd className="m-0">
              <Unknown value={job.seniority} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Compensation</dt>
            <dd className="m-0">
              <Unknown
                value={
                  job.salaryMin != null || job.salaryMax != null
                    ? [
                        job.salaryCurrency,
                        job.salaryMin?.toString() ?? "?",
                        "–",
                        job.salaryMax?.toString() ?? "?",
                        job.salaryInterval,
                      ]
                        .filter(Boolean)
                        .join(" ")
                    : null
                }
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Your state</dt>
            <dd className="m-0">
              <Unknown value={job.candidateDispositions[0]?.status} />
            </dd>
          </div>
        </dl>
        <div>
          <h3 className="text-sm font-semibold">Description</h3>
          <p className="text-sm whitespace-pre-wrap">
            <Unknown value={job.description} />
          </p>
        </div>
      </section>
      <section className="card grid gap-4 p-5">
        <h2 className="text-lg font-semibold">Explainable fit</h2>
        {analysis ? (
          <div className="grid gap-4">
            <p className="m-0">
              <strong className="text-2xl text-brand">
                {analysis.overallFit}
              </strong>{" "}
              overall · {Math.round(analysis.confidence * 100)}% confidence ·{" "}
              {analysis.scoringVersion}
            </p>
            <JsonSnapshot
              value={{
                strengths: analysis.strengths,
                partialMatches: analysis.partialMatches,
                gaps: analysis.gaps,
                hardConflicts: analysis.hardConflicts,
                unknowns: analysis.unknowns,
              }}
            />
          </div>
        ) : (
          <p className="m-0 text-sm text-foreground-muted">
            No fit analysis has been recorded for this candidate and job yet.
          </p>
        )}
      </section>
      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-semibold">Sources</h2>
        <ul className="m-0 grid gap-2 pl-5 text-sm">
          {job.sourceRecords.map((source) => (
            <li key={`${source.source}:${source.sourceUrl}`}>
              {source.source} · verified{" "}
              <Unknown value={source.lastVerifiedAt?.toLocaleString()} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
