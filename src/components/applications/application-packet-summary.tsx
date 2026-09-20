import {
  applicationAnswerValues,
  candidateDecisionKey,
  isApplicationPacket,
  semanticApplicationAnswerGroups,
  type ApplicationPacket,
  type ApplicationPacketAnswer,
  type ApplicationPacketField,
} from "@/core/domain/applications/application-packet";
import { CopyApplicationValue } from "./copy-application-value";
import { ApplicationOverridesForm } from "./application-overrides-form";
import { LocalDateTime } from "@/components/ui/local-date-time";

function Status({ value }: { readonly value: string }) {
  return (
    <span className="badge">{value.replaceAll("_", " ").toLowerCase()}</span>
  );
}

function Field({ field }: { readonly field: ApplicationPacketField }) {
  const answer =
    "questionId" in field ? (field as ApplicationPacketAnswer) : null;
  const displayValue =
    answer && field.value
      ? applicationAnswerValues(field.value)
          .map(
            (value) =>
              answer.optionIdentities?.find((option) => option.value === value)
                ?.label ?? value,
          )
          .join(", ")
      : field.value;
  return (
    <li className="border-border grid min-w-0 gap-1 border-b pb-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="min-w-0 text-sm break-words">{field.label}</strong>
        {field.status !== "RESOLVED" && field.status !== "NOT_REQUIRED" ? (
          <Status value={field.status} />
        ) : null}
      </div>
      {displayValue ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="min-w-0 break-words">{displayValue}</span>
          <CopyApplicationValue value={displayValue} />
        </div>
      ) : (
        <span className="text-sm text-foreground-muted">
          {field.status === "CANDIDATE_REQUIRED_EXTERNAL"
            ? "Complete or verify this on the employer form."
            : field.status === "UNSUPPORTED"
              ? "RoleProwl cannot safely represent this required control."
              : field.required
                ? "Required value needs review."
                : "No value required for this packet."}
        </span>
      )}
      {displayValue && field.status === "CANDIDATE_REQUIRED_EXTERNAL" ? (
        <span className="text-xs text-foreground-muted">
          Intended value is known, but you must complete or verify this control
          on the employer form.
        </span>
      ) : null}
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
  resumeDownloadAvailable = false,
  saveAction,
  confirmKnowledgeAction,
}: {
  readonly applicationId: string;
  readonly packet: unknown;
  readonly resumeDownloadAvailable?: boolean;
  readonly saveAction: (formData: FormData) => Promise<void>;
  readonly confirmKnowledgeAction?: (formData: FormData) => Promise<void>;
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
  const rawNeedsReview = [...packet.identity, ...answers].filter(
    (field) =>
      field.status === "UNRESOLVED" ||
      field.status === "CONFLICTING" ||
      field.status === "UNSUPPORTED",
  );
  const candidateRequired = answers.filter(
    (field) => field.status === "CANDIDATE_REQUIRED_EXTERNAL",
  );
  const candidateRequiredHumanStepLabels = new Set(
    candidateRequired.map(
      (field) => `Complete ${field.label} on the employer form.`,
    ),
  );
  const generalHumanSteps = packet.transfer.humanSteps.filter(
    (step) => !candidateRequiredHumanStepLabels.has(step.label),
  );
  const roleProwlPrepared = [...packet.identity, ...answers].filter(
    (field) => field.status === "RESOLVED",
  );
  const coalesceAnswers = (fields: readonly ApplicationPacketAnswer[]) =>
    semanticApplicationAnswerGroups(fields).map((group) => group.answers[0]!);
  const rawAnswerBlockers = rawNeedsReview.filter(
    (field): field is ApplicationPacketAnswer => "questionId" in field,
  );
  const answerBlockers = coalesceAnswers(rawAnswerBlockers);
  const answerBlockerKeys = new Set(answerBlockers.map(candidateDecisionKey));
  const identityBlockers = rawNeedsReview.filter(
    (field) =>
      !("questionId" in field) &&
      !answerBlockerKeys.has(candidateDecisionKey(field)),
  );
  const needsReview = [...identityBlockers, ...answerBlockers];
  const staleAnswers = coalesceAnswers(
    answers.filter(
      (field) =>
        field.resolutionReasonCode === "CANDIDATE_KNOWLEDGE_STALE" &&
        Boolean(field.value),
    ),
  );
  const editableBlockers = needsReview.filter(
    (field) =>
      !(
        "classification" in field &&
        typeof field.classification === "string" &&
        ["DOCUMENT", "PROFILE_FACT"].includes(field.classification)
      ),
  );
  const staleQuestionIds = new Set(
    staleAnswers.map((answer) => answer.questionId),
  );
  const taskEditableBlockers = editableBlockers.filter(
    (field) =>
      !(
        "questionId" in field &&
        typeof field.questionId === "string" &&
        staleQuestionIds.has(field.questionId)
      ),
  );
  const nonEditableBlockers = needsReview.filter(
    (field) =>
      !editableBlockers.some((candidate) => candidate.key === field.key),
  );
  const rawApplicationSpecific = [...packet.identity, ...answers].filter(
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
  const applicationSpecificAnswers = coalesceAnswers(
    rawApplicationSpecific.filter(
      (field): field is ApplicationPacketAnswer => "questionId" in field,
    ),
  );
  const applicationSpecificAnswerKeys = new Set(
    applicationSpecificAnswers.map(candidateDecisionKey),
  );
  const applicationSpecific = [
    ...rawApplicationSpecific.filter(
      (field) =>
        !("questionId" in field) &&
        !applicationSpecificAnswerKeys.has(candidateDecisionKey(field)),
    ),
    ...applicationSpecificAnswers,
  ];
  const editablePreparedAnswers = coalesceAnswers(
    roleProwlPrepared.filter((field): field is ApplicationPacketAnswer => {
      if (!("questionId" in field)) return false;
      const answer = field as ApplicationPacketAnswer;
      return (
        answer.resolutionDisposition === "AUTO_RESOLVED" &&
        answer.classification === "CANDIDATE_KNOWLEDGE"
      );
    }),
  );
  const representedAnswerKeys = new Set(
    [
      ...answerBlockers,
      ...applicationSpecificAnswers,
      ...editablePreparedAnswers,
    ].map(candidateDecisionKey),
  );
  const editablePrepared = [
    ...roleProwlPrepared.filter(
      (field) =>
        !("questionId" in field) &&
        field.required &&
        !representedAnswerKeys.has(candidateDecisionKey(field)),
    ),
    ...editablePreparedAnswers,
  ];
  const preparedReviewFields = [
    ...new Map(
      [...editablePrepared, ...applicationSpecific].map((field) => [
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
              Built <LocalDateTime value={packet.builtAt} /> ·{" "}
              {packet.reviewedAt ? (
                <>
                  Reviewed <LocalDateTime value={packet.reviewedAt} />
                </>
              ) : (
                "Candidate review required"
              )}
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
        {packet.source.name === "GREENHOUSE" &&
        packet.source.inspection !== "AVAILABLE" ? (
          <p className="m-0 rounded-lg border border-brand p-3 text-sm">
            RoleProwl could not inspect the current employer question schema.
            This packet cannot be marked ready for employer handoff until the
            schema is available and reviewed.
          </p>
        ) : null}
        {packet.reviewInvalidatedReason ===
        "MATERIAL_REQUIRED_QUESTION_SCHEMA_CHANGED" ? (
          <p className="m-0 rounded-lg border border-brand p-3 text-sm">
            The employer changed a required question or control after your last
            review. Review the rebuilt packet again before handoff.
          </p>
        ) : null}
        <nav
          aria-label="Application packet filters"
          className="grid gap-3 sm:grid-cols-3"
        >
          {(
            [
              [
                "Automatically prepared",
                new Set(roleProwlPrepared.map(candidateDecisionKey)).size,
                "#prepared-fields",
              ],
              ["Needs you", needsReview.length, "#needs-you"],
              [
                "Complete on employer site",
                candidateRequired.length + generalHumanSteps.length,
                "#employer-site",
              ],
            ] satisfies readonly (readonly [string, number, string])[]
          ).map(([label, count, href]) => (
            <a
              className="application-summary-link border-border rounded-lg border p-3"
              href={href}
              key={label}
            >
              <strong className="text-xl text-brand">{count}</strong>
              <p className="m-0 text-xs">{label}</p>
            </a>
          ))}
        </nav>
        {needsReview.length > 0 ? (
          <p className="m-0 flex flex-wrap items-center gap-3 text-sm">
            <strong>
              {needsReview.length} decision{needsReview.length === 1 ? "" : "s"}{" "}
              remaining
            </strong>
            <a className="font-semibold text-brand" href="#needs-you">
              Go to first
            </a>
          </p>
        ) : null}
      </div>

      {(needsReview.length > 0 || unresolvedResume) && (
        <section className="card grid gap-4 border-brand p-5" id="needs-you">
          <div>
            <h2 className="text-base font-semibold">Needs you</h2>
            <p className="m-0 text-sm text-foreground-muted">
              Only unresolved candidate decisions appear here. Resolve an item,
              save, and this list will rebuild around the work that remains.
            </p>
          </div>
          {staleAnswers.length > 0 && confirmKnowledgeAction ? (
            <div className="grid gap-3">
              <h3 className="m-0 text-sm font-semibold">
                Reconfirm saved details
              </h3>
              <form action={confirmKnowledgeAction} className="grid gap-3">
                <input
                  name="applicationId"
                  type="hidden"
                  value={applicationId}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  {staleAnswers.map((answer) => (
                    <label
                      className="application-task-card grid min-w-0 gap-2"
                      key={answer.questionId}
                    >
                      <strong className="text-sm break-words">
                        {answer.label}
                      </strong>
                      <span className="text-sm break-words">
                        {answer.value}
                      </span>
                      <small>
                        This reusable detail is old enough to require
                        confirmation.
                      </small>
                      <span className="flex items-center gap-2 text-sm">
                        <input
                          name="questionId"
                          type="checkbox"
                          value={answer.questionId}
                        />
                        Still true
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="button button-secondary w-fit"
                    type="submit"
                  >
                    Confirm selected answers
                  </button>
                  <a
                    className="text-sm font-semibold text-brand"
                    href="/profile#recurring-details"
                  >
                    Update in Career Profile
                  </a>
                </div>
              </form>
            </div>
          ) : null}
          {taskEditableBlockers.length > 0 ? (
            <ApplicationOverridesForm
              applicationId={applicationId}
              fields={taskEditableBlockers}
              key={packet.builtAt}
              mode="TASKS"
              saveAction={saveAction}
            />
          ) : null}
          {nonEditableBlockers.length > 0 ? (
            <div className="grid gap-2 text-sm">
              {nonEditableBlockers.map((field) => (
                <p className="m-0" key={field.key}>
                  <strong>{field.label}:</strong> update the corresponding
                  source in{" "}
                  <a className="font-semibold text-brand" href="/profile">
                    Career Profile
                  </a>
                  .
                </p>
              ))}
            </div>
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

      <details
        className="card min-w-0 overflow-hidden p-5"
        id="prepared-fields"
      >
        <summary className="cursor-pointer font-semibold">
          Ready / prepared ·{" "}
          {new Set(roleProwlPrepared.map(candidateDecisionKey)).size} fields
          handled by RoleProwl
        </summary>
        {preparedReviewFields.length > 0 ? (
          <div className="border-border mt-5 grid gap-3 border-b pb-5">
            <div>
              <h2 className="text-base font-semibold">
                Review or override prepared values
              </h2>
              <p className="m-0 text-sm text-foreground-muted">
                These values are already prepared. Changes apply to this
                Application without silently changing Career Profile.
              </p>
            </div>
            <ApplicationOverridesForm
              applicationId={applicationId}
              fields={preparedReviewFields}
              key={`prepared-${packet.builtAt}`}
              saveAction={saveAction}
            />
          </div>
        ) : null}
        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
          <section className="card min-w-0 p-5">
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
            <Values
              title="Experience"
              values={packet.professional.experience}
            />
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
                <p className="safe-filename m-0 min-w-0 text-sm text-foreground-muted">
                  {document.fileName ?? "No document selected"}
                </p>
                {document.fileName ? (
                  <p className="m-0 text-xs text-foreground-muted">
                    Selected for this application. RoleProwl Helper will attempt
                    an exact in-memory attachment and report whether it was
                    verified.
                  </p>
                ) : null}
                {document.kind === "RESUME" &&
                document.fileName &&
                resumeDownloadAvailable ? (
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
            {roleProwlPrepared.some((field) => "questionId" in field) ? (
              <ul className="m-0 grid list-none gap-3 p-0">
                {roleProwlPrepared
                  .filter(
                    (field): field is ApplicationPacketAnswer =>
                      "questionId" in field,
                  )
                  .map((answer) => (
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
      </details>

      <div className="grid gap-5 lg:grid-cols-2">
        <section
          className="card grid gap-3 border-brand p-5"
          id="employer-site"
        >
          <h2 className="text-base font-semibold">
            Complete on the employer form
          </h2>
          <p className="m-0 text-sm">
            RoleProwl collects representable employer decisions before handoff.
            You remain responsible only for the steps listed here, plus final
            review and Submit.
          </p>
          <ul className="m-0 grid gap-1 pl-5 text-sm">
            {candidateRequired.map((field) => (
              <li key={field.key}>{field.label}</li>
            ))}
            {generalHumanSteps.map((step) => (
              <li key={step.label}>{step.label}</li>
            ))}
          </ul>
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
            RoleProwl has mapped supported values but has not claimed they were
            transferred, validated, or accepted by Greenhouse.
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
