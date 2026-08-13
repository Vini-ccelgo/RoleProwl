import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { JsonSnapshot } from "@/components/applications/json-snapshot";
import { PageHeader } from "@/components/ui/page-header";
import {
  applicationTransitionsFrom,
  type ApplicationState,
} from "@/core/domain/applications/application-tracker";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import {
  confirmExternalApplicationAction,
  updateApplicationStateAction,
} from "./actions";

const USER_OUTCOME_STATES = new Set<ApplicationState>([
  "RESPONSE",
  "INTERVIEW",
  "REJECTED",
  "WITHDRAWN",
  "OFFER",
  "CLOSED",
]);

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function Unknown({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground-muted">{children || "Unknown"}</span>;
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const { applicationId } = await params;
  const application = await databaseClient().application.findFirst({
    where: { id: applicationId, userId: actor.id },
    include: {
      job: true,
      resumeVersion: {
        select: {
          id: true,
          renderedFileName: true,
          templateVersion: true,
          promptVersion: true,
          generatedAt: true,
        },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!application) notFound();
  const nextStates = applicationTransitionsFrom(application.state).filter(
    (state) => USER_OUTCOME_STATES.has(state),
  );
  const canConfirmExternal =
    application.state === "READY" &&
    ["EXTERNAL_APPLICATION", "MANUAL_EXTERNAL"].includes(
      application.submissionMechanism,
    );

  return (
    <div className="grid gap-7">
      <Link className="text-sm font-semibold text-brand" href="/applications">
        ← All applications
      </Link>
      <PageHeader
        title={application.job.title}
        description={`${application.job.company} · ${label(application.state)}`}
      />

      <section className="card grid gap-4 p-5 md:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold">Application record</h2>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="font-semibold">State</dt>
              <dd className="m-0">{label(application.state)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Mechanism</dt>
              <dd className="m-0">{label(application.submissionMechanism)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Destination</dt>
              <dd className="m-0 break-all">
                <Unknown>{application.submissionDestination}</Unknown>
              </dd>
            </div>
            <div>
              <dt className="font-semibold">External receipt</dt>
              <dd className="m-0">
                <Unknown>{application.externalSubmissionId}</Unknown>
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <h2 className="text-base font-semibold">Timestamps</h2>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="font-semibold">Created</dt>
              <dd className="m-0">{application.createdAt.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="font-semibold">Last updated</dt>
              <dd className="m-0">{application.updatedAt.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="font-semibold">Submitted</dt>
              <dd className="m-0">
                <Unknown>{application.submittedAt?.toLocaleString()}</Unknown>
              </dd>
            </div>
            <div>
              <dt className="font-semibold">External confirmation</dt>
              <dd className="m-0">
                <Unknown>
                  {application.externalConfirmedAt?.toLocaleString()}
                </Unknown>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {canConfirmExternal && (
        <section className="card grid gap-3 border-brand p-5">
          <h2 className="text-base font-semibold">
            External application ready
          </h2>
          <p className="m-0 text-sm">
            Open the official destination, submit there, then confirm here. This
            record will not claim submission before you confirm it.
          </p>
          <div className="flex flex-wrap gap-2">
            {application.submissionDestination && (
              <a
                className="button button-primary"
                href={application.submissionDestination}
                rel="noreferrer"
                target="_blank"
              >
                Open application
              </a>
            )}
            <form action={confirmExternalApplicationAction}>
              <input
                name="applicationId"
                type="hidden"
                value={application.id}
              />
              <button
                className="button button-secondary"
                name="confirmed"
                type="submit"
                value="yes"
              >
                I submitted this externally
              </button>
            </form>
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Fit at application time</h2>
          <JsonSnapshot value={application.fitSnapshot} />
        </section>
        <section className="card p-5">
          <h2 className="text-base font-semibold">Policy result</h2>
          <JsonSnapshot value={application.policyResultSnapshot} />
        </section>
        <section className="card p-5">
          <h2 className="text-base font-semibold">Exact generated text</h2>
          <JsonSnapshot value={application.generatedTextSnapshot} />
        </section>
        <section className="card p-5">
          <h2 className="text-base font-semibold">Exact answers</h2>
          <JsonSnapshot value={application.answersSnapshot} />
        </section>
        <section className="card p-5">
          <h2 className="text-base font-semibold">Documents sent</h2>
          <JsonSnapshot value={application.documentsSnapshot} />
        </section>
        <section className="card p-5">
          <h2 className="text-base font-semibold">Exact résumé version</h2>
          {application.resumeVersion ? (
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="font-semibold">Version ID</dt>
                <dd className="m-0 break-all">
                  {application.resumeVersion.id}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">File</dt>
                <dd className="m-0">
                  {application.resumeVersion.renderedFileName}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Template</dt>
                <dd className="m-0">
                  {application.resumeVersion.templateVersion}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Prompt</dt>
                <dd className="m-0">
                  {application.resumeVersion.promptVersion}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="m-0 text-sm">Unknown or no résumé was attached.</p>
          )}
        </section>
      </div>

      {nextStates.length > 0 && (
        <section className="card grid gap-3 p-5">
          <h2 className="text-base font-semibold">Record an outcome</h2>
          <form action={updateApplicationStateAction} className="grid gap-3">
            <input name="applicationId" type="hidden" value={application.id} />
            <label className="field max-w-xl">
              <span>Optional note</span>
              <input name="note" placeholder="What changed?" />
            </label>
            <div className="flex flex-wrap gap-2">
              {nextStates.map((state) => (
                <button
                  className="button button-secondary"
                  key={state}
                  name="next"
                  type="submit"
                  value={state}
                >
                  {label(state)}
                </button>
              ))}
            </div>
          </form>
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-base font-semibold">History</h2>
        {application.events.length === 0 ? (
          <p className="m-0 text-sm">No history events were recorded.</p>
        ) : (
          <ol className="grid gap-3 pl-5 text-sm">
            {application.events.map((event) => (
              <li key={event.id}>
                <strong>{label(event.type)}</strong> ·{" "}
                {event.createdAt.toLocaleString()}
                <br />
                <span className="text-foreground-muted">
                  {event.fromState ? `${label(event.fromState)} → ` : ""}
                  {label(event.toState)}
                </span>
                {event.detail && (
                  <div className="mt-1">
                    <JsonSnapshot value={event.detail} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
