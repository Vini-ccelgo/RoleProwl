import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export default async function ApplicationsPage() {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applications = await databaseClient().application.findMany({
    where: { userId: actor.id },
    include: {
      job: { select: { company: true, title: true } },
      _count: { select: { events: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const submitted = applications.filter((item) =>
    ["SUBMITTED", "RESPONSE", "INTERVIEW", "REJECTED", "OFFER"].includes(
      item.state,
    ),
  ).length;
  const attention = applications.filter((item) =>
    ["NEEDS_REVIEW", "FAILED"].includes(item.state),
  ).length;

  return (
    <div className="grid gap-7">
      <PageHeader
        title="Applications"
        description="The durable record of what was prepared, how it was submitted, and what happened afterward. Unknown states remain unknown."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Tracked", applications.length],
          ["Submitted", submitted],
          ["Needs attention", attention],
        ].map(([name, count]) => (
          <div className="card p-4" key={name}>
            <strong className="text-2xl text-brand">{count}</strong>
            <p className="m-0 text-sm">{name}</p>
          </div>
        ))}
      </div>
      {applications.length === 0 ? (
        <div className="card p-8">
          <h2 className="text-lg font-semibold">No applications tracked yet</h2>
          <p className="mb-0 text-sm">
            Prepared applications appear here with their exact materials and
            submission history.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {applications.map((application) => (
            <Link
              className="card grid gap-3 p-5 transition hover:border-brand sm:grid-cols-[1fr_auto]"
              href={`/applications/${application.id}`}
              key={application.id}
            >
              <div>
                <span className="badge">{label(application.state)}</span>
                <h2 className="mt-3 text-lg font-semibold">
                  {application.job.title}
                </h2>
                <p className="m-0 text-sm">{application.job.company}</p>
              </div>
              <div className="text-left text-sm text-foreground-muted sm:text-right">
                <p className="m-0 font-semibold text-foreground">
                  {label(application.submissionMechanism)}
                </p>
                <p className="m-0">
                  Updated {application.updatedAt.toLocaleString()}
                </p>
                <p className="m-0">
                  {application._count.events} history event
                  {application._count.events === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
