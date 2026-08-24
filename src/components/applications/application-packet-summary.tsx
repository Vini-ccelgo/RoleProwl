import {
  isApplicationPacket,
  type ApplicationPacket,
  type ApplicationPacketField,
} from "@/core/domain/applications/application-packet";
import { CopyApplicationValue } from "./copy-application-value";
import { ApplicationOverridesForm } from "./application-overrides-form";

function Status({ value }: { readonly value: string }) {
  return (
    <span className="badge">{value.replaceAll("_", " ").toLowerCase()}</span>
  );
}

function Field({ field }: { readonly field: ApplicationPacketField }) {
  return (
    <li className="border-border grid gap-1 border-b pb-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm">{field.label}</strong>
        {field.status !== "RESOLVED" && field.status !== "NOT_REQUIRED" ? (
          <Status value={field.status} />
        ) : null}
      </div>
      {field.value ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{field.value}</span>
          <CopyApplicationValue value={field.value} />
        </div>
      ) : (
        <span className="text-sm text-foreground-muted">
          {field.required
            ? "Required value needs review."
            : "No value required for this packet."}
        </span>
      )}
      {field.alternatives?.length ? (
        <span className="text-xs text-foreground-muted">
          Other known value{field.alternatives.length === 1 ? "" : "s"}:{" "}
          {field.alternatives.join(", ")}
        </span>
      ) : null}
      {(field.provenance ?? []).length ? (
        <span className="text-xs text-foreground-muted">
          Source:{" "}
          {(field.provenance ?? []).map((item) => item.label).join(", ")}
        </span>
      ) : null}
    </li>
  );
}

function Values({
  title,
  values,
}: {
  readonly title: string;
  readonly values: readonly string[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {values.length ? (
        <ul className="m-0 grid gap-1 pl-5 text-sm">
          {values.map((value, index) => (
            <li key={`${value}-${index}`}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-foreground-muted">None represented.</p>
      )}
    </div>
  );
}

export function ApplicationPacketSummary({
  applicationId,
  packet: value,
  saveAction,
}: {
  readonly applicationId: string;
  readonly packet: unknown;
  readonly saveAction: (formData: FormData) => Promise<void>;
}) {
  if (!isApplicationPacket(value))
    return (
      <section className="card grid gap-2 border-brand p-5">
        <h2 className="text-base font-semibold">Application packet</h2>
        <p className="m-0 text-sm">
          This record predates packet preparation. Refresh it before treating
          the application as ready.
        </p>
      </section>
    );
  const packet: ApplicationPacket = value;
  const answers = packet.answers ?? [];
  const needsReview = [...packet.identity, ...answers].filter(
    (field) => field.status === "UNRESOLVED" || field.status === "CONFLICTING",
  );
  const editableBlockers = needsReview.filter(
    (field) =>
      !(
        "classification" in field &&
        typeof field.classification === "string" &&
        ["DOCUMENT", "PROFILE_FACT"].includes(field.classification)
      ),
  );
  const applicationSpecific = [...packet.identity, ...answers].filter(
    (field) =>
      (field.provenance ?? []).some(
        (item) => item.source === "APPLICATION_OVERRIDE",
      ) &&
      !(
        "classification" in field &&
        typeof field.classification === "string" &&
        ["DOCUMENT", "PROFILE_FACT"].includes(field.classification)
      ),
  );
  const editableFields = [
    ...new Map(
      [...editableBlockers, ...applicationSpecific].map((field) => [
        field.key,
        field,
      ]),
    ).values(),
  ];
  const unresolvedResume = packet.documents.find(
    (document) => document.kind === "RESUME" && !document.fileName,
  );
  return (
    <section className="grid gap-5" aria-label="Application packet">
      <div className="card grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Application packet</h2>
            <p className="m-0 text-sm text-foreground-muted">
              Built {new Date(packet.builtAt).toLocaleString()} ·{" "}
              {packet.reviewedAt
                ? `Reviewed ${new Date(packet.reviewedAt).toLocaleString()}`
                : "Candidate review required"}
            </p>
          </div>
          <Status
            value={
              packet.completeness.readyForSubmissionHandoff
                ? "PACKET_READY"
                : "NEEDS_REVIEW"
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Known", packet.completeness.known],
            ["Ready", packet.completeness.ready],
            ["Needs review", packet.completeness.needsReview],
            ["Human required", packet.completeness.humanRequired],
          ].map(([label, count]) => (
            <div className="border-border rounded-lg border p-3" key={label}>
              <strong className="text-xl text-brand">{count}</strong>
              <p className="m-0 text-xs">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {(editableFields.length > 0 || unresolvedResume) && (
        <section className="card grid gap-4 border-brand p-5">
          <div>
            <h2 className="text-base font-semibold">
              {editableBlockers.length > 0
                ? "Needs your input"
                : "Application-specific values"}
            </h2>
            <p className="m-0 text-sm text-foreground-muted">
              These answers apply only to this Application. They do not change
              your global Career Profile.
            </p>
          </div>
          {editableFields.length > 0 ? (
            <ApplicationOverridesForm
              applicationId={applicationId}
              fields={editableFields}
              key={packet.builtAt}
              saveAction={saveAction}
            />
          ) : null}
          {unresolvedResume ? (
            <p className="m-0 text-sm">
              A résumé is still required. Upload a candidate-owned résumé in{" "}
              <a className="font-semibold text-brand" href="/profile">
                Career Profile
              </a>
              , then refresh this packet.
            </p>
          ) : null}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold">
            Applicant identity and contact
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0">
            {packet.identity.map((field) => (
              <Field field={field} key={field.key} />
            ))}
          </ul>
        </section>

        <section className="card grid gap-4 p-5">
          <h2 className="text-base font-semibold">Professional data</h2>
          <p className="m-0 text-sm">
            <strong>Target role:</strong> {packet.professional.targetRole}
          </p>
          <Values title="Experience" values={packet.professional.experience} />
          <Values title="Education" values={packet.professional.education} />
          <Values
            title="Credentials"
            values={packet.professional.credentials}
          />
          <Values title="Skills" values={packet.professional.skills} />
          <Values title="Languages" values={packet.professional.languages} />
          <p className="m-0 text-sm">
            <strong>Work authorization:</strong>{" "}
            {packet.professional.workAuthorization ?? "Unresolved"}
          </p>
          <p className="m-0 text-sm">
            <strong>Sponsorship requirement:</strong>{" "}
            {packet.professional.sponsorshipRequired == null
              ? "Unresolved"
              : packet.professional.sponsorshipRequired
                ? "Required"
                : "Not required"}
          </p>
        </section>

        <section className="card grid gap-3 self-start p-5">
          <h2 className="text-base font-semibold">Documents</h2>
          {packet.documents.map((document) => (
            <div
              className="grid gap-1"
              key={`${document.kind}-${document.fileName}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{document.label}</strong>
                <Status value={document.status} />
              </div>
              <p className="m-0 text-sm text-foreground-muted">
                {document.fileName ?? "No document selected"}
              </p>
              {document.kind === "RESUME" && document.fileName ? (
                <a
                  className="text-sm font-semibold text-brand"
                  href={`/api/applications/${applicationId}/resume`}
                >
                  Download application résumé
                </a>
              ) : null}
            </div>
          ))}
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">Application answers</h2>
          {answers.length ? (
            <ul className="m-0 grid list-none gap-3 p-0">
              {answers.map((answer) => (
                <Field field={answer} key={answer.questionId} />
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-foreground-muted">
              No public employer questions were represented. Inspect the
              employer form manually.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card grid gap-3 border-brand p-5">
          <h2 className="text-base font-semibold">Needs review</h2>
          {needsReview.length ? (
            <ul className="m-0 grid gap-1 pl-5 text-sm">
              {needsReview.map((field) => (
                <li key={field.key}>
                  {field.label} ·{" "}
                  {field.status.replaceAll("_", " ").toLowerCase()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm">
              No RoleProwl-resolvable required field remains unresolved.
            </p>
          )}
        </section>

        <section className="card grid gap-3 p-5">
          <h2 className="text-base font-semibold">
            Transfer and human handoff
          </h2>
          <p className="m-0 text-sm">
            <strong>Mechanism:</strong>{" "}
            {packet.transfer.mechanism.replaceAll("_", " ").toLowerCase()}
          </p>
          <p className="m-0 text-sm">
            <strong>Transfer status:</strong>{" "}
            {packet.transfer.status.replaceAll("_", " ").toLowerCase()}
          </p>
          <p className="m-0 text-sm">
            RoleProwl has mapped these values but has not claimed they were
            transferred.
          </p>
          <ul className="m-0 grid gap-1 pl-5 text-sm">
            {packet.transfer.humanSteps.map((step) => (
              <li key={step.label}>{step.label}</li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
