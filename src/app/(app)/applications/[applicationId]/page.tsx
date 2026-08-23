import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ApplicationPreparationSummary } from "@/components/applications/application-preparation-summary";
import { ApplicationPacketSummary } from "@/components/applications/application-packet-summary";
import { GreenhouseAssistedApply } from "@/components/applications/greenhouse-assisted-apply";
import { PageHeader } from "@/components/ui/page-header";
import {
  applicationTransitionsFrom,
  type ApplicationState,
} from "@/core/domain/applications/application-tracker";
import {
  APPLICATION_OUTCOME_POLICY_COPY,
  applicationEventLabel,
  applicationOutcomeActionLabel,
  applicationStateLabel,
} from "@/features/applications/application-presentation";
import {
  applicationPacketCanBeReviewed,
  isApplicationPacket,
} from "@/core/domain/applications/application-packet";
import { buildGreenhouseTransferDraft } from "@/core/domain/applications/greenhouse-transfer";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import {
  confirmExternalApplicationAction,
  markApplicationReadyAction,
  refreshApplicationPacketAction,
  saveApplicationOverridesAction,
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

function Unknown({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground-muted">{children || "Unknown"}</span>;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function assistedTransferDraft(
  packet: Parameters<typeof buildGreenhouseTransferDraft>[0]["packet"] | null,
  destination: string | null,
) {
  if (!packet || !destination) return null;
  try {
    return buildGreenhouseTransferDraft({ packet, destination });
  } catch {
    return null;
  }
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
      job: {
        include: {
          reviewQueueItems: {
            where: {
              userId: actor.id,
              status: { in: ["PENDING", "DEFERRED"] },
            },
            select: { id: true, status: true },
            take: 1,
          },
        },
      },
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
  const packetValue = object(application.submissionPayloadSnapshot)?.packet;
  const packet = isApplicationPacket(packetValue) ? packetValue : null;
  const nextStates = applicationTransitionsFrom(application.state).filter(
    (state) => USER_OUTCOME_STATES.has(state),
  );
  const canConfirmExternal =
    application.state === "READY" &&
    packet?.completeness.readyForSubmissionHandoff === true &&
    ["EXTERNAL_APPLICATION", "MANUAL_EXTERNAL"].includes(
      application.submissionMechanism,
    );
  const pendingReview = application.job.reviewQueueItems[0] ?? null;
  const canMarkReady =
    !pendingReview &&
    (application.state === "PREPARING" ||
      application.state === "NEEDS_REVIEW") &&
    Boolean(packet && applicationPacketCanBeReviewed(packet));
  const canRefreshPacket =
    !application.submittedAt &&
    ["PREPARING", "NEEDS_REVIEW", "READY", "FAILED"].includes(
      application.state,
    );
  const displayedState =
    application.state === "READY" &&
    packet?.completeness.readyForSubmissionHandoff !== true
      ? "Packet refresh required"
      : applicationStateLabel(application.state);
  const greenhouseTransfer = assistedTransferDraft(
    canConfirmExternal ? packet : null,
    application.submissionDestination,
  );

  return (
    <div className="grid gap-7">
      <Link className="text-sm font-semibold text-brand" href="/applications">
        ← All applications
      </Link>
      <PageHeader
        title={application.job.title}
        description={`${application.job.company} · ${displayedState}`}
      />

      <section className="card grid gap-4 p-5 md:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold">Application record</h2>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="font-semibold">State</dt>
              <dd className="m-0">{displayedState}</dd>
            </div>
            <div>
              <dt className="font-semibold">Mechanism</dt>
              <dd className="m-0">
                {application.submissionMechanism
                  .replaceAll("_", " ")
                  .toLowerCase()}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Destination</dt>
              <dd className="m-0 break-all">
                {application.submissionDestination ? (
                  <span className="break-all">
                    {application.submissionDestination}
                  </span>
                ) : (
                  <Unknown>Unknown</Unknown>
                )}
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

      <section className="card grid gap-2 p-5">
        <h2 className="text-base font-semibold">Outcome policy</h2>
        <p className="m-0 text-sm">{APPLICATION_OUTCOME_POLICY_COPY}</p>
      </section>

      {canRefreshPacket && (
        <section className="card grid gap-3 p-5">
          <h2 className="text-base font-semibold">Packet source refresh</h2>
          <p className="m-0 text-sm">
            Rebuild this pre-submission packet from the current Career Profile,
            accepted résumé facts, answer memory, and approved document
            candidates. A refreshed packet must be reviewed again.
          </p>
          <form action={refreshApplicationPacketAction}>
            <input name="applicationId" type="hidden" value={application.id} />
            <button className="button button-secondary" type="submit">
              Refresh application packet
            </button>
          </form>
        </section>
      )}

      {pendingReview && (
        <section className="card grid gap-3 border-brand p-5">
          <h2 className="text-base font-semibold">Review required</h2>
          <p className="m-0 text-sm">
            Resolve the pending review item before marking this application
            ready for employer submission.
          </p>
          <Link className="font-semibold text-brand" href="/queue">
            Open review queue →
          </Link>
        </section>
      )}

      {canMarkReady && (
        <section className="card grid gap-3 border-brand p-5">
          <h2 className="text-base font-semibold">Review preparation</h2>
          <p className="m-0 text-sm">
            Review the attached résumé, writing, answers, and warnings below.
            Marking ready does not submit anything.
          </p>
          <form action={markApplicationReadyAction}>
            <input name="applicationId" type="hidden" value={application.id} />
            <button className="button button-primary" type="submit">
              I reviewed this — mark ready
            </button>
          </form>
        </section>
      )}

      {!pendingReview &&
        !canMarkReady &&
        (application.state === "PREPARING" ||
          application.state === "NEEDS_REVIEW") && (
          <section className="card grid gap-2 border-brand p-5">
            <h2 className="text-base font-semibold">
              Packet is not ready for approval
            </h2>
            <p className="m-0 text-sm">
              Resolve the required fields listed in the packet, then refresh it.
              RoleProwl will not label an incomplete packet ready.
            </p>
          </section>
        )}

      <ApplicationPacketSummary
        applicationId={application.id}
        packet={packetValue}
        saveAction={saveApplicationOverridesAction}
      />

      {greenhouseTransfer ? (
        <GreenhouseAssistedApply
          draft={greenhouseTransfer}
          resumeDownloadUrl={`/api/applications/${application.id}/resume`}
        />
      ) : null}

      {canConfirmExternal && (
        <section className="card grid gap-3 border-brand p-5">
          <h2 className="text-base font-semibold">Continue manually</h2>
          <p className="m-0 text-sm">
            Open the employer&apos;s site and complete the application yourself.
            RoleProwl will not mark it submitted until you confirm that you
            submitted it.
          </p>
          <div className="flex flex-wrap gap-2">
            {application.submissionDestination && (
              <a
                className="button button-primary"
                href={application.submissionDestination}
                rel="noreferrer"
                target="_blank"
              >
                Continue on employer site
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
                Confirm I submitted it
              </button>
            </form>
          </div>
        </section>
      )}

      <ApplicationPreparationSummary
        answers={application.answersSnapshot}
        documents={application.documentsSnapshot}
        fit={application.fitSnapshot}
        generatedText={application.generatedTextSnapshot}
        policy={application.policyResultSnapshot}
      />

      <div className="grid gap-5">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Résumé version</h2>
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
              <input name="note" placeholder="Add a note about this update" />
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
                  {applicationOutcomeActionLabel(state)}
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
                <strong>{applicationEventLabel(event.type)}</strong> ·{" "}
                {event.createdAt.toLocaleString()}
                <br />
                <span className="text-foreground-muted">
                  {event.fromState
                    ? `${applicationStateLabel(event.fromState)} → `
                    : ""}
                  {applicationStateLabel(event.toState)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
