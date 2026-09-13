import {
  saveCandidateKnowledgeAnswer,
  submitCandidateNarrative,
} from "@/app/(app)/profile/actions";
import {
  candidateKnowledgePolicy,
  type CandidateKnowledgeConcept,
} from "@/core/domain/candidate/candidate-knowledge";
import type { getCandidateKnowledgeSnapshot } from "@/integrations/candidate/prisma-candidate-knowledge";
import { TextAreaField, TextField } from "./vault-fields";
import { VaultForm } from "./vault-form";
import { CandidateKnowledgeReviewForm } from "./candidate-knowledge-review-form";

type Snapshot = Awaited<ReturnType<typeof getCandidateKnowledgeSnapshot>>;

function label(concept: CandidateKnowledgeConcept) {
  if (concept.startsWith("LANGUAGE_PROFICIENCY:"))
    return `${concept.slice("LANGUAGE_PROFICIENCY:".length).replaceAll("-", " ")} proficiency`;
  return concept.toLocaleLowerCase("en-US").replaceAll("_", " ");
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
            We won&apos;t ask you for information already supported by your
            résumé or profile. Suggested details from longer answers are never
            reused until you approve them.
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
                      .toLocaleLowerCase("en-US")
                      .replaceAll("_", " ")}{" "}
                    value is retained and differs from{" "}
                    {item.result.conflictingEvidence
                      .map((evidence) =>
                        evidence.provenance.source
                          .toLocaleLowerCase("en-US")
                          .replaceAll("_", " "),
                      )
                      .join(", ")}{" "}
                    evidence.
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

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

        {snapshot.gapPrompts.map((prompt) => (
          <details key={prompt.theme}>
            <summary>{prompt.title}</summary>
            <p className="candidate-knowledge-prompt">{prompt.prompt}</p>
            <VaultForm
              action={submitCandidateNarrative}
              resetOnSuccess
              submitLabel="Save answer"
            >
              <input name="theme" type="hidden" value={prompt.theme} />
              <TextAreaField
                name="content"
                label={`Cover only what is useful (${prompt.concepts.map(label).join(", ")})`}
                wide
              />
            </VaultForm>
          </details>
        ))}

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
            {snapshot.narratives.length === 1 ? " is" : "s are"} saved. Original
            wording is retained when suggestions are corrected or declined.
          </p>
        ) : null}
      </div>
    </section>
  );
}
