import {
  reconfirmCandidateKnowledgeAnswer,
  removeCandidateKnowledgeAnswer,
  saveCandidateKnowledgeAnswer,
  saveProfessionalHistoryAuthorities,
  saveJurisdictionCandidateKnowledge,
  submitCandidateNarrative,
} from "@/app/(app)/profile/actions";
import {
  CANDIDATE_NARRATIVE_PROMPTS,
  candidateKnowledgeConflictSourceLabels,
  candidateKnowledgePolicy,
  candidateKnowledgeSourceLabel,
  type CandidateKnowledgeConcept,
} from "@/core/domain/candidate/candidate-knowledge";
import type { getCandidateKnowledgeSnapshot } from "@/integrations/candidate/prisma-candidate-knowledge";
import { TextAreaField, TextField } from "./vault-fields";
import { VaultForm } from "./vault-form";
import { CandidateKnowledgeReviewForm } from "./candidate-knowledge-review-form";

type Snapshot = Awaited<ReturnType<typeof getCandidateKnowledgeSnapshot>>;
type CoverageItem = Snapshot["coverage"][number];

const CONCEPT_LABELS = {
  CURRENT_LOCATION: "Current location",
  CURRENT_EMPLOYMENT_STATUS: "Current employment",
  NOTICE_PERIOD: "Notice period",
  START_AVAILABILITY: "Start availability",
  CURRENT_COMPENSATION: "Current compensation",
  DESIRED_SALARY: "Desired compensation",
  REMOTE_PREFERENCE: "Remote-work preference",
  WILLING_TO_RELOCATE: "Relocation willingness",
  TRAVEL_AVAILABILITY: "Travel availability",
  TARGET_ROLE: "Target role",
  WORK_ENVIRONMENT_PREFERENCE: "Work-environment preference",
  PROFESSIONAL_STRENGTHS: "Professional strengths",
  REUSABLE_SELF_DESCRIPTION: "Reusable self-description",
  AI_HIRING_PROCESS_PREFERENCE: "AI-assisted hiring preference",
  GENERAL_DATA_USE_PREFERENCE: "General data-use preference",
} as const;

function label(concept: CandidateKnowledgeConcept) {
  const countryLabel = (countryCode: string) =>
    ({ BR: "Brazil", US: "United States" })[countryCode] ?? countryCode;
  if (concept.startsWith("LANGUAGE_PROFICIENCY:"))
    return `${concept.slice("LANGUAGE_PROFICIENCY:".length).replaceAll("-", " ")} proficiency`;
  if (concept.startsWith("WORK_AUTHORIZATION:"))
    return `Work authorization — ${countryLabel(concept.slice("WORK_AUTHORIZATION:".length))}`;
  if (concept.startsWith("SPONSORSHIP_REQUIREMENT:"))
    return `Sponsorship requirement — ${countryLabel(concept.slice("SPONSORSHIP_REQUIREMENT:".length))}`;
  return (
    CONCEPT_LABELS[concept as keyof typeof CONCEPT_LABELS] ??
    concept.toLocaleLowerCase("en-US").replaceAll("_", " ")
  );
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function editableValue(value: unknown) {
  const item = record(value);
  if (typeof item.text === "string") return item.text;
  if (typeof item.proficiency === "string") return item.proficiency;
  if (typeof item.status === "string") return item.status;
  if (Array.isArray(item.value)) return item.value.join(", ");
  if (typeof item.value === "boolean") return item.value ? "Yes" : "No";
  if (["string", "number"].includes(typeof item.value))
    return String(item.value);
  return "";
}

function compensationValue(value: unknown) {
  const outer = record(value);
  return record(
    outer.value && typeof outer.value === "object" ? outer.value : outer,
  );
}

function displayValue(item: CoverageItem) {
  const compensation = compensationValue(item.result.value);
  if (typeof compensation.amount === "number")
    return [
      typeof compensation.currency === "string" ? compensation.currency : null,
      compensation.amount.toLocaleString("en-US"),
      typeof compensation.period === "string" && compensation.period
        ? `/ ${compensation.period}`
        : null,
    ]
      .filter(Boolean)
      .join(" ");
  return editableValue(item.result.value) || "Saved";
}

function confirmedLabel(item: CoverageItem) {
  if (item.result.freshness === "STALE") return "Needs confirmation";
  if (
    !item.result.confirmedAt ||
    candidateKnowledgePolicy(item.concept)?.reverifyAfterDays == null
  )
    return null;
  return `Confirmed ${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(item.result.confirmedAt)}`;
}

function authorizationValue(item: CoverageItem | undefined) {
  const status = item ? record(item.result.value).status : null;
  if (typeof status !== "string") return "";
  const normalized = status.trim().toUpperCase().replaceAll("_", " ");
  if (normalized === "AUTHORIZED" || normalized === "YES") return "AUTHORIZED";
  if (normalized === "NOT AUTHORIZED" || normalized === "NO")
    return "NOT_AUTHORIZED";
  return "";
}

function sponsorshipValue(item: CoverageItem | undefined) {
  const required = record(item?.result.value).required;
  return typeof required !== "boolean"
    ? ""
    : required
      ? "REQUIRED"
      : "NOT_REQUIRED";
}

function proposedText(value: unknown) {
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return JSON.stringify(value);
}

export function CandidateKnowledgeSection({
  snapshot,
}: {
  snapshot: Snapshot;
}) {
  const directGaps = snapshot.coverage.filter((item) => {
    const policy = candidateKnowledgePolicy(item.concept);
    return (
      policy?.class !== "CANDIDATE_AUTHORITY" &&
      item.status !== "KNOWN" &&
      (policy?.class !== "STABLE_FACT" ||
        item.concept.startsWith("LANGUAGE_PROFICIENCY:"))
    );
  });
  return (
    <section className="vault-section candidate-knowledge-section">
      <header>
        <div>
          <h2>Reusable application details</h2>
          <p>
            Review what RoleProwl remembers and can reuse on future
            applications. Suggested details from longer answers are never reused
            until you approve them.
          </p>
        </div>
      </header>
      <div className="vault-section-body">
        <div
          className="candidate-knowledge-counts"
          aria-label="Recurring detail coverage"
        >
          <div>
            <strong>{snapshot.counts.known}</strong>
            <span>Already known</span>
          </div>
          <div>
            <strong>{snapshot.counts.worthCompleting}</strong>
            <span>Worth completing</span>
          </div>
          <div>
            <strong>{snapshot.counts.optional}</strong>
            <span>Optional</span>
          </div>
        </div>
        {snapshot.counts.conflicts > 0 ? (
          <div className="candidate-knowledge-conflict">
            <strong>Conflicting details need attention</strong>
            <ul>
              {snapshot.coverage
                .filter((item) => item.status === "CONFLICT")
                .map((item) => (
                  <li key={item.concept}>
                    {label(item.concept)}: the current{" "}
                    {item.result.provenance?.source
                      ? candidateKnowledgeSourceLabel(
                          item.result.provenance.source,
                        )
                      : "candidate knowledge"}{" "}
                    value is retained and differs from{" "}
                    {candidateKnowledgeConflictSourceLabels(item.result).join(
                      ", ",
                    )}{" "}
                    evidence.
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        <div className="candidate-knowledge-current">
          <div>
            <h3>Your current reusable details</h3>
            <p className="candidate-knowledge-prompt">
              These are separate from the missing details RoleProwl still asks
              you to complete.
            </p>
          </div>
          {snapshot.currentDetails.length > 0 ? (
            snapshot.currentDetails.map((item) => {
              const compensation = compensationValue(item.result.value);
              const freshness = confirmedLabel(item);
              const removable =
                item.result.provenance?.source === "ANSWER_MEMORY";
              return (
                <article className="vault-record" key={item.concept}>
                  <strong>{label(item.concept)}</strong>
                  <span>{displayValue(item)}</span>
                  {freshness ? <small>{freshness}</small> : null}
                  <details>
                    <summary>Edit</summary>
                    <VaultForm
                      action={saveCandidateKnowledgeAnswer}
                      submitLabel="Save updated detail"
                    >
                      <input
                        name="concept"
                        type="hidden"
                        value={item.concept}
                      />
                      <TextField
                        name="answer"
                        label="Current value or amount"
                        defaultValue={
                          typeof compensation.amount === "number"
                            ? compensation.amount
                            : editableValue(item.result.value)
                        }
                        required
                      />
                      {item.concept === "CURRENT_COMPENSATION" ||
                      item.concept === "DESIRED_SALARY" ? (
                        <>
                          <TextField
                            name="currency"
                            label="Currency"
                            defaultValue={
                              typeof compensation.currency === "string"
                                ? compensation.currency
                                : ""
                            }
                            required
                          />
                          <TextField
                            name="period"
                            label="Basis"
                            defaultValue={
                              typeof compensation.period === "string"
                                ? compensation.period
                                : ""
                            }
                          />
                        </>
                      ) : null}
                    </VaultForm>
                  </details>
                  {item.result.freshness === "STALE" ? (
                    <VaultForm
                      action={reconfirmCandidateKnowledgeAnswer}
                      className="candidate-knowledge-inline-action"
                      submitLabel="Still true"
                    >
                      <input
                        name="concept"
                        type="hidden"
                        value={item.concept}
                      />
                    </VaultForm>
                  ) : null}
                  {removable ? (
                    <VaultForm
                      action={removeCandidateKnowledgeAnswer}
                      className="candidate-knowledge-inline-action"
                      submitLabel="Remove saved answer"
                    >
                      <input
                        name="concept"
                        type="hidden"
                        value={item.concept}
                      />
                    </VaultForm>
                  ) : null}
                </article>
              );
            })
          ) : (
            <p className="m-0 text-sm text-foreground-muted">
              No recurring details are saved yet.
            </p>
          )}
        </div>

        {directGaps.length > 0 ? (
          <details open>
            <summary>Complete one recurring detail</summary>
            <VaultForm
              action={saveCandidateKnowledgeAnswer}
              resetOnSuccess
              submitLabel="Save recurring detail"
            >
              <label className="field">
                <span>Missing or stale detail</span>
                <select name="concept" required>
                  <option value="">Select…</option>
                  {directGaps.map((item) => (
                    <option key={item.concept} value={item.concept}>
                      {label(item.concept)}
                      {candidateKnowledgePolicy(item.concept)
                        ?.candidateInputOptional
                        ? " (optional)"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <TextField name="answer" label="Your answer or amount" required />
              <TextField
                name="currency"
                label="Currency (compensation only)"
                placeholder="BRL"
              />
              <TextField
                name="period"
                label="Basis (compensation only)"
                placeholder="monthly or annual"
              />
            </VaultForm>
          </details>
        ) : (
          <p className="m-0 text-sm text-foreground-muted">
            No high-value recurring gaps remain.
          </p>
        )}

        {snapshot.jurisdictions.length > 0 ? (
          <div className="candidate-knowledge-current">
            <h3>Saved work authorization</h3>
            {snapshot.jurisdictions.map((jurisdiction) => {
              const stale =
                jurisdiction.authorization?.result.freshness === "STALE" ||
                jurisdiction.sponsorship?.result.freshness === "STALE";
              const confirmedAt = [
                jurisdiction.authorization?.result.confirmedAt,
                jurisdiction.sponsorship?.result.confirmedAt,
              ]
                .filter((candidate): candidate is Date => Boolean(candidate))
                .sort((left, right) => right.getTime() - left.getTime())[0];
              return (
                <article
                  className="vault-record"
                  key={jurisdiction.countryCode}
                >
                  <strong>
                    {{ BR: "Brazil", US: "United States" }[
                      jurisdiction.countryCode as "BR" | "US"
                    ] ?? jurisdiction.countryCode}
                  </strong>
                  <span>
                    {authorizationValue(jurisdiction.authorization) ===
                    "AUTHORIZED"
                      ? "Authorized"
                      : authorizationValue(jurisdiction.authorization) ===
                          "NOT_AUTHORIZED"
                        ? "Not authorized"
                        : "Authorization not recorded"}
                  </span>
                  <span>
                    Sponsorship:{" "}
                    {sponsorshipValue(jurisdiction.sponsorship) === "REQUIRED"
                      ? "Required"
                      : sponsorshipValue(jurisdiction.sponsorship) ===
                          "NOT_REQUIRED"
                        ? "Not required"
                        : "Not recorded"}
                  </span>
                  <small>
                    {stale
                      ? "Needs confirmation"
                      : confirmedAt
                        ? `Confirmed ${new Intl.DateTimeFormat("en-US", {
                            dateStyle: "medium",
                            timeZone: "UTC",
                          }).format(confirmedAt)}`
                        : "Candidate-approved"}
                  </small>
                  <details>
                    <summary>Edit</summary>
                    <VaultForm
                      action={saveJurisdictionCandidateKnowledge}
                      submitLabel="Save authorization details"
                    >
                      <input
                        name="jurisdictionCountryCode"
                        type="hidden"
                        value={jurisdiction.countryCode}
                      />
                      <label className="field">
                        <span>Work authorization</span>
                        <select
                          name="workAuthorization"
                          defaultValue={authorizationValue(
                            jurisdiction.authorization,
                          )}
                          required
                        >
                          <option value="">Select…</option>
                          <option value="AUTHORIZED">Authorized</option>
                          <option value="NOT_AUTHORIZED">Not authorized</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Sponsorship requirement</span>
                        <select
                          name="sponsorshipRequirement"
                          defaultValue={sponsorshipValue(
                            jurisdiction.sponsorship,
                          )}
                          required
                        >
                          <option value="">Select…</option>
                          <option value="REQUIRED">Required</option>
                          <option value="NOT_REQUIRED">Not required</option>
                        </select>
                      </label>
                    </VaultForm>
                  </details>
                </article>
              );
            })}
          </div>
        ) : null}

        <details>
          <summary>Add work authorization for a jurisdiction</summary>
          <VaultForm
            action={saveJurisdictionCandidateKnowledge}
            resetOnSuccess
            submitLabel="Save authorization details"
          >
            <TextField
              name="jurisdictionCountryCode"
              label="Country code"
              placeholder="BR"
              required
            />
            <label className="field">
              <span>Work authorization</span>
              <select name="workAuthorization" required>
                <option value="">Select…</option>
                <option value="AUTHORIZED">Authorized</option>
                <option value="NOT_AUTHORIZED">Not authorized</option>
              </select>
            </label>
            <label className="field">
              <span>Sponsorship requirement</span>
              <select name="sponsorshipRequirement" required>
                <option value="">Select…</option>
                <option value="REQUIRED">Required</option>
                <option value="NOT_REQUIRED">Not required</option>
              </select>
            </label>
          </VaultForm>
          <p className="candidate-knowledge-prompt">
            Record only a jurisdiction you explicitly choose. Candidate
            location, nationality, and résumé location are not used to select a
            country.
          </p>
        </details>

        {CANDIDATE_NARRATIVE_PROMPTS.map((prompt) => {
          const current = snapshot.narratives.find(
            (narrative) => narrative.theme === prompt.theme,
          );
          const gaps = snapshot.gapPrompts.find(
            (candidate) => candidate.theme === prompt.theme,
          );
          return (
            <details key={prompt.theme}>
              <summary>{prompt.title}</summary>
              <p className="candidate-knowledge-prompt">{prompt.prompt}</p>
              <VaultForm
                key={current?.id ?? prompt.theme}
                action={submitCandidateNarrative}
                submitLabel={current ? "Save updated answer" : "Save answer"}
              >
                <input name="theme" type="hidden" value={prompt.theme} />
                <TextAreaField
                  name="content"
                  label={
                    gaps?.concepts.length
                      ? `Cover only what is useful (${gaps.concepts.map(label).join(", ")})`
                      : "Your current answer"
                  }
                  defaultValue={current?.content}
                  wide
                />
              </VaultForm>
            </details>
          );
        })}

        {snapshot.proposals.length > 0 ? (
          <div className="candidate-knowledge-proposals">
            <h3>Review suggested reusable details</h3>
            {snapshot.proposals.map((proposal) => (
              <article className="vault-record" key={proposal.id}>
                <strong>
                  {label(proposal.concept as CandidateKnowledgeConcept)}
                </strong>
                <small>
                  From your{" "}
                  {proposal.narrative.theme
                    .toLocaleLowerCase("en-US")
                    .replaceAll("_", " ")}{" "}
                  answer: “{proposal.supportingText}”
                </small>
                <CandidateKnowledgeReviewForm
                  proposalId={proposal.id}
                  proposedValue={proposedText(proposal.proposedValue)}
                />
              </article>
            ))}
          </div>
        ) : null}

        {snapshot.narratives.length > 0 ? (
          <p className="m-0 text-xs text-foreground-muted">
            {snapshot.narratives.length} candidate-authored context answer
            {snapshot.narratives.length === 1 ? " is" : "s are"} retained across
            versions. Updating an answer does not approve suggestions or remove
            previously approved reusable details.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function ProfessionalHistoryAuthorityControls({
  snapshot,
}: {
  snapshot: Snapshot;
}) {
  const completeness = snapshot.coverage.find(
    (item) => item.concept === "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
  );
  const negativeInference = snapshot.coverage.find(
    (item) =>
      item.concept === "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
  );
  const completenessStored = Boolean(completeness?.result.value?.attested);
  const negativeStored = Boolean(negativeInference?.result.value?.authorized);
  const completenessActive =
    completenessStored && completeness?.result.status === "AVAILABLE";
  const negativeActive =
    completenessActive &&
    negativeStored &&
    negativeInference?.result.status === "AVAILABLE";
  const latestConfirmation = [
    completeness?.result.confirmedAt,
    negativeInference?.result.confirmedAt,
  ]
    .filter((item): item is Date => Boolean(item))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return (
    <section className="vault-section professional-history-authority">
      <header>
        <div>
          <h2>Professional-history authority</h2>
          <p>
            Control whether RoleProwl may treat your Career Profile as complete
            when answering ordinary experience questions.
          </p>
        </div>
      </header>
      <div className="vault-section-body">
        <p className="candidate-knowledge-prompt">
          Completeness: {completenessActive ? "Active" : "Inactive"}. Negative
          experience inference: {negativeActive ? "Active" : "Inactive"}.
          {completenessStored && !completenessActive
            ? " Your completeness confirmation needs renewal."
            : ""}
          {negativeStored &&
          negativeInference?.result.status === "STALE_CONFIRMATION_REQUIRED"
            ? " Your negative-inference permission needs renewal."
            : ""}
          {latestConfirmation
            ? ` Last confirmed ${new Intl.DateTimeFormat("en-US", {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(latestConfirmation)}.`
            : ""}
        </p>
        <VaultForm
          action={saveProfessionalHistoryAuthorities}
          submitLabel={
            completenessStored
              ? "Save or reconfirm authority"
              : "Save authority"
          }
        >
          <label className="field">
            <span>
              <input
                defaultChecked={completenessStored}
                name="completeProfessionalHistory"
                type="checkbox"
              />{" "}
              My Career Profile contains my complete professional history
              through today.
            </span>
          </label>
          <label className="field">
            <span>
              <input
                defaultChecked={negativeStored}
                name="negativeHistoryInference"
                type="checkbox"
              />{" "}
              Allow RoleProwl to answer ordinary professional-experience
              questions with “No” or “0 years” when this complete history has no
              matching evidence.
            </span>
          </label>
          <small>
            The second permission is effective only while the completeness
            confirmation is current. Employment-history changes clear both
            permissions.
          </small>
        </VaultForm>
      </div>
    </section>
  );
}
