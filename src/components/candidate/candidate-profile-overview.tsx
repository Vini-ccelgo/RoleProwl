import type { getCandidateKnowledgeSnapshot } from "@/integrations/candidate/prisma-candidate-knowledge";
import type { CandidateTruthVault } from "@/integrations/candidate/prisma-truth-vault";
import {
  candidateKnowledgeProfileGroups,
  type CandidateKnowledgeConcept,
} from "@/core/domain/candidate/candidate-knowledge";

type Snapshot = Awaited<ReturnType<typeof getCandidateKnowledgeSnapshot>>;

function conceptLabel(concept: CandidateKnowledgeConcept) {
  if (concept.startsWith("LANGUAGE_PROFICIENCY:"))
    return `${concept.slice("LANGUAGE_PROFICIENCY:".length).replaceAll("-", " ")} proficiency`;
  const labels: Partial<Record<CandidateKnowledgeConcept, string>> = {
    NOTICE_PERIOD: "Notice period",
    DESIRED_SALARY: "Desired compensation",
    CURRENT_LOCATION: "Current location",
    TARGET_ROLE: "Target role",
    REMOTE_PREFERENCE: "Remote preference",
    WILLING_TO_RELOCATE: "Relocation willingness",
    TRAVEL_AVAILABILITY: "Travel availability",
    START_AVAILABILITY: "Start availability",
  };
  return (
    labels[concept] ?? concept.toLocaleLowerCase("en-US").replaceAll("_", " ")
  );
}

function target(concept: CandidateKnowledgeConcept) {
  if (
    [
      "FIRST_NAME",
      "LAST_NAME",
      "APPLICATION_EMAIL",
      "PHONE",
      "CURRENT_LOCATION",
      "WEBSITE_URL",
      "LINKEDIN_URL",
    ].includes(concept)
  )
    return "#personal";
  if (concept === "EMPLOYMENT_HISTORY") return "#experience";
  if (
    concept === "EDUCATION_HISTORY" ||
    concept === "SKILLS" ||
    concept === "CERTIFICATIONS" ||
    concept.startsWith("LANGUAGE")
  )
    return "#education-skills";
  if (
    concept.includes("PROFESSIONAL_HISTORY") ||
    concept.includes("DATA_USE") ||
    concept.includes("AI_HIRING")
  )
    return "#application-defaults";
  return "#preferences";
}

export function CandidateProfileOverview({
  snapshot,
  vault,
}: {
  readonly snapshot: Snapshot;
  readonly vault: CandidateTruthVault;
}) {
  const groups = candidateKnowledgeProfileGroups(snapshot.coverage);
  const profileConflicts = Object.entries(vault.effectiveProfile.values).filter(
    ([, value]) => value.conflicts.length > 0,
  );
  const tasks = [
    ...groups.ATTENTION.map((item) => ({
      key: item.concept,
      title: conceptLabel(item.concept),
      detail:
        item.status === "CONFLICT"
          ? "Conflicting sources"
          : "Needs confirmation",
      href: target(item.concept),
      action: "Review",
    })),
    ...profileConflicts.map(([field]) => ({
      key: `profile-${field}`,
      title: field.replace(/([a-z])([A-Z])/gu, "$1 $2"),
      detail: "Conflicting résumé and profile values",
      href: "#personal",
      action: "Compare",
    })),
    ...groups.RECOMMENDED.slice(0, 6).map((item) => ({
      key: item.concept,
      title: conceptLabel(item.concept),
      detail: "Not saved",
      href: target(item.concept),
      action: "Add",
    })),
  ].filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.key === item.key) === index,
  );

  return (
    <section className="profile-overview" id="overview">
      <nav
        className="profile-status-summary"
        aria-label="Career Profile status"
      >
        <a href="#personal">
          <strong>{groups.KNOWN.length}</strong>
          <span>Known</span>
        </a>
        <a href="#profile-action-queue">
          <strong>{groups.RECOMMENDED.length}</strong>
          <span>Worth completing</span>
        </a>
        <a href="#profile-action-queue">
          <strong>{groups.ATTENTION.length + profileConflicts.length}</strong>
          <span>Needs attention</span>
        </a>
      </nav>
      <div className="profile-action-queue" id="profile-action-queue">
        <div>
          <p className="eyebrow">
            Finish these to reduce future application work
          </p>
          <h2>
            {tasks.length
              ? "Your next profile actions"
              : "Your important details are current"}
          </h2>
          <p>
            {vault.verifiedResumeFacts.length
              ? `${vault.verifiedResumeFacts.length} source-explicit résumé fact${vault.verifiedResumeFacts.length === 1 ? " is" : "s are"} available with provenance.`
              : "Upload a résumé from onboarding to import source-explicit facts."}
          </p>
        </div>
        {tasks.length ? (
          <ul>
            {tasks.slice(0, 8).map((task) => (
              <li key={task.key}>
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.detail}</small>
                </span>
                <a className="button button-secondary" href={task.href}>
                  {task.action}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
