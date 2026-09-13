export type CandidateKnowledgeClass =
  | "STABLE_FACT"
  | "REUSABLE_PERSONAL"
  | "VOLATILE_CONSEQUENTIAL"
  | "CONSENT_PREFERENCE_ONLY";

export type CandidateKnowledgeOrigin = "EXPLICIT" | "DERIVED" | "INFERRED";
export type CandidateKnowledgeSource =
  | "PROFILE"
  | "TRUTH_VAULT"
  | "RESUME"
  | "ANSWER_MEMORY"
  | "CANDIDATE_DIRECT"
  | "CANDIDATE_NARRATIVE";

export const STATIC_CANDIDATE_KNOWLEDGE_CONCEPTS = [
  "FIRST_NAME",
  "LAST_NAME",
  "APPLICATION_EMAIL",
  "PHONE",
  "CURRENT_LOCATION",
  "WEBSITE_URL",
  "LINKEDIN_URL",
  "EMPLOYMENT_HISTORY",
  "EDUCATION_HISTORY",
  "CERTIFICATIONS",
  "SKILLS",
  "PROJECTS",
  "US_WORK_AUTHORIZATION",
  "US_FUTURE_SPONSORSHIP",
  "CURRENT_EMPLOYMENT_STATUS",
  "NOTICE_PERIOD",
  "CURRENT_COMPENSATION",
  "DESIRED_SALARY",
  "REMOTE_PREFERENCE",
  "WILLING_TO_RELOCATE",
  "TRAVEL_AVAILABILITY",
  "START_AVAILABILITY",
  "TARGET_ROLE",
  "WORK_ENVIRONMENT_PREFERENCE",
  "PROFESSIONAL_STRENGTHS",
  "REUSABLE_SELF_DESCRIPTION",
  "AI_HIRING_PROCESS_PREFERENCE",
  "GENERAL_DATA_USE_PREFERENCE",
] as const;

export type StaticCandidateKnowledgeConcept =
  (typeof STATIC_CANDIDATE_KNOWLEDGE_CONCEPTS)[number];
export type CandidateKnowledgeConcept =
  | StaticCandidateKnowledgeConcept
  | `LANGUAGE:${string}`
  | `LANGUAGE_PROFICIENCY:${string}`;

export interface CandidateKnowledgePolicy {
  readonly class: CandidateKnowledgeClass;
  readonly candidateInputOptional: boolean;
  readonly reverifyAfterDays: number | null;
  readonly reusableForEmployerQuestions: boolean;
}

const STABLE: CandidateKnowledgePolicy = {
  class: "STABLE_FACT",
  candidateInputOptional: false,
  reverifyAfterDays: null,
  reusableForEmployerQuestions: true,
};
const REUSABLE: CandidateKnowledgePolicy = {
  class: "REUSABLE_PERSONAL",
  candidateInputOptional: false,
  reverifyAfterDays: null,
  reusableForEmployerQuestions: true,
};
const VOLATILE_30: CandidateKnowledgePolicy = {
  class: "VOLATILE_CONSEQUENTIAL",
  candidateInputOptional: false,
  reverifyAfterDays: 30,
  reusableForEmployerQuestions: true,
};
const VOLATILE_90: CandidateKnowledgePolicy = {
  ...VOLATILE_30,
  reverifyAfterDays: 90,
};
const OPTIONAL_VOLATILE_30: CandidateKnowledgePolicy = {
  ...VOLATILE_30,
  candidateInputOptional: true,
};
const CONSENT_PREFERENCE: CandidateKnowledgePolicy = {
  class: "CONSENT_PREFERENCE_ONLY",
  candidateInputOptional: true,
  reverifyAfterDays: 180,
  reusableForEmployerQuestions: false,
};

export const CANDIDATE_KNOWLEDGE_REGISTRY: Readonly<
  Record<StaticCandidateKnowledgeConcept, CandidateKnowledgePolicy>
> = {
  FIRST_NAME: STABLE,
  LAST_NAME: STABLE,
  APPLICATION_EMAIL: STABLE,
  PHONE: STABLE,
  CURRENT_LOCATION: VOLATILE_30,
  WEBSITE_URL: STABLE,
  LINKEDIN_URL: STABLE,
  EMPLOYMENT_HISTORY: STABLE,
  EDUCATION_HISTORY: STABLE,
  CERTIFICATIONS: STABLE,
  SKILLS: STABLE,
  PROJECTS: STABLE,
  US_WORK_AUTHORIZATION: VOLATILE_90,
  US_FUTURE_SPONSORSHIP: VOLATILE_90,
  CURRENT_EMPLOYMENT_STATUS: VOLATILE_30,
  NOTICE_PERIOD: VOLATILE_30,
  CURRENT_COMPENSATION: OPTIONAL_VOLATILE_30,
  DESIRED_SALARY: OPTIONAL_VOLATILE_30,
  REMOTE_PREFERENCE: VOLATILE_90,
  WILLING_TO_RELOCATE: VOLATILE_90,
  TRAVEL_AVAILABILITY: VOLATILE_90,
  START_AVAILABILITY: VOLATILE_30,
  TARGET_ROLE: REUSABLE,
  WORK_ENVIRONMENT_PREFERENCE: REUSABLE,
  PROFESSIONAL_STRENGTHS: REUSABLE,
  REUSABLE_SELF_DESCRIPTION: REUSABLE,
  AI_HIRING_PROCESS_PREFERENCE: CONSENT_PREFERENCE,
  GENERAL_DATA_USE_PREFERENCE: CONSENT_PREFERENCE,
};

export function normalizeLanguageKey(language: string) {
  return language
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function candidateKnowledgePolicy(
  concept: CandidateKnowledgeConcept,
): CandidateKnowledgePolicy | null {
  if (concept.startsWith("LANGUAGE:")) return STABLE;
  if (concept.startsWith("LANGUAGE_PROFICIENCY:")) return REUSABLE;
  return (
    CANDIDATE_KNOWLEDGE_REGISTRY[concept as StaticCandidateKnowledgeConcept] ??
    null
  );
}

export function isCandidateKnowledgeConcept(
  concept: string,
): concept is CandidateKnowledgeConcept {
  if (
    concept.startsWith("LANGUAGE:") ||
    concept.startsWith("LANGUAGE_PROFICIENCY:")
  ) {
    const language = concept.slice(concept.indexOf(":") + 1);
    return Boolean(language && normalizeLanguageKey(language) === language);
  }
  return STATIC_CANDIDATE_KNOWLEDGE_CONCEPTS.includes(
    concept as StaticCandidateKnowledgeConcept,
  );
}

export interface CandidateKnowledgeEvidence {
  readonly autoAnswerAllowed: boolean;
  readonly candidateApproved: boolean;
  readonly concept: CandidateKnowledgeConcept;
  readonly confirmedAt: Date;
  readonly origin: CandidateKnowledgeOrigin;
  readonly reusable: boolean;
  readonly source: CandidateKnowledgeSource;
  readonly sourceId?: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export type CandidateKnowledgeQueryStatus =
  "AVAILABLE" | "MISSING" | "STALE_CONFIRMATION_REQUIRED";

export interface CandidateKnowledgeQueryResult {
  readonly applicationUse: "REUSABLE_ANSWER" | "PREFERENCE_CONTEXT_ONLY";
  readonly autoAnswerAllowed: boolean;
  readonly candidateApproved: boolean;
  readonly concept: CandidateKnowledgeConcept;
  readonly conflict: boolean;
  readonly conflictingEvidence: readonly {
    readonly confirmedAt: Date;
    readonly origin: Exclude<CandidateKnowledgeOrigin, "INFERRED">;
    readonly provenance: {
      readonly source: CandidateKnowledgeSource;
      readonly sourceId?: string;
    };
    readonly value: Readonly<Record<string, unknown>>;
  }[];
  readonly confirmedAt: Date | null;
  readonly freshness: "CURRENT" | "STALE" | "NOT_APPLICABLE";
  readonly origin: Exclude<CandidateKnowledgeOrigin, "INFERRED"> | null;
  readonly provenance: {
    readonly source: CandidateKnowledgeSource;
    readonly sourceId?: string;
  } | null;
  readonly reusable: boolean;
  readonly status: CandidateKnowledgeQueryStatus;
  readonly value: Readonly<Record<string, unknown>> | null;
}

function sameValue(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
) {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
          .map(([key, child]) => [key, canonicalize(child)]),
      );
    return value;
  };
  return (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
  );
}

function stale(
  evidence: CandidateKnowledgeEvidence,
  policy: CandidateKnowledgePolicy,
  now: Date,
) {
  if (policy.reverifyAfterDays == null) return false;
  const expiresAt = new Date(evidence.confirmedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + policy.reverifyAfterDays);
  return expiresAt <= now;
}

export function resolveCandidateKnowledge(input: {
  readonly concept: CandidateKnowledgeConcept;
  readonly evidence: readonly CandidateKnowledgeEvidence[];
  readonly now?: Date;
}): CandidateKnowledgeQueryResult {
  const policy = candidateKnowledgePolicy(input.concept);
  if (!policy)
    throw new Error(`Unknown candidate knowledge concept: ${input.concept}`);
  const usable = input.evidence.filter(
    (item) =>
      item.concept === input.concept &&
      item.origin !== "INFERRED" &&
      item.candidateApproved &&
      item.reusable,
  );
  const ranked = [...usable].sort((left, right) => {
    const leftDirect =
      left.source === "CANDIDATE_DIRECT" ||
      left.source === "ANSWER_MEMORY" ||
      left.source === "PROFILE";
    const rightDirect =
      right.source === "CANDIDATE_DIRECT" ||
      right.source === "ANSWER_MEMORY" ||
      right.source === "PROFILE";
    if (leftDirect !== rightDirect) return leftDirect ? -1 : 1;
    return right.confirmedAt.getTime() - left.confirmedAt.getTime();
  });
  const selected = ranked[0];
  if (!selected) {
    return {
      concept: input.concept,
      applicationUse:
        policy.class === "CONSENT_PREFERENCE_ONLY"
          ? "PREFERENCE_CONTEXT_ONLY"
          : "REUSABLE_ANSWER",
      autoAnswerAllowed: false,
      status: "MISSING",
      value: null,
      provenance: null,
      origin: null,
      candidateApproved: false,
      reusable: false,
      freshness: "NOT_APPLICABLE",
      confirmedAt: null,
      conflict: false,
      conflictingEvidence: [],
    };
  }
  const isStale = stale(selected, policy, input.now ?? new Date());
  const conflictingEvidence = ranked
    .slice(1)
    .filter((item) => !sameValue(item.value, selected.value))
    .map((item) => ({
      confirmedAt: item.confirmedAt,
      origin: item.origin as Exclude<CandidateKnowledgeOrigin, "INFERRED">,
      provenance: { source: item.source, sourceId: item.sourceId },
      value: item.value,
    }));
  return {
    concept: input.concept,
    applicationUse:
      policy.class === "CONSENT_PREFERENCE_ONLY"
        ? "PREFERENCE_CONTEXT_ONLY"
        : "REUSABLE_ANSWER",
    autoAnswerAllowed:
      selected.autoAnswerAllowed && policy.reusableForEmployerQuestions,
    status: isStale ? "STALE_CONFIRMATION_REQUIRED" : "AVAILABLE",
    value: selected.value,
    provenance: { source: selected.source, sourceId: selected.sourceId },
    origin: selected.origin as Exclude<CandidateKnowledgeOrigin, "INFERRED">,
    candidateApproved: selected.candidateApproved,
    reusable: selected.reusable,
    freshness: isStale
      ? "STALE"
      : policy.reverifyAfterDays == null
        ? "NOT_APPLICABLE"
        : "CURRENT",
    confirmedAt: selected.confirmedAt,
    conflict: conflictingEvidence.length > 0,
    conflictingEvidence,
  };
}

export type CandidateKnowledgeCoverageStatus =
  "KNOWN" | "PARTIAL" | "MISSING" | "CONFLICT";

export interface CandidateKnowledgeCoverageItem {
  readonly concept: CandidateKnowledgeConcept;
  readonly result: CandidateKnowledgeQueryResult;
  readonly status: CandidateKnowledgeCoverageStatus;
}

export function buildCandidateKnowledgeCoverage(input: {
  readonly evidence: readonly CandidateKnowledgeEvidence[];
  readonly concepts?: readonly CandidateKnowledgeConcept[];
  readonly now?: Date;
}): CandidateKnowledgeCoverageItem[] {
  const concepts = new Set<CandidateKnowledgeConcept>(
    input.concepts ?? STATIC_CANDIDATE_KNOWLEDGE_CONCEPTS,
  );
  for (const evidence of input.evidence) concepts.add(evidence.concept);
  for (const concept of [...concepts]) {
    if (concept.startsWith("LANGUAGE:")) {
      concepts.add(`LANGUAGE_PROFICIENCY:${concept.slice("LANGUAGE:".length)}`);
    }
  }
  return [...concepts].map((concept) => {
    const result = resolveCandidateKnowledge({
      concept,
      evidence: input.evidence,
      now: input.now,
    });
    const languageKey = concept.startsWith("LANGUAGE_PROFICIENCY:")
      ? concept.slice("LANGUAGE_PROFICIENCY:".length)
      : null;
    const languageKnown = languageKey
      ? resolveCandidateKnowledge({
          concept: `LANGUAGE:${languageKey}`,
          evidence: input.evidence,
          now: input.now,
        }).status === "AVAILABLE"
      : false;
    return {
      concept,
      result,
      status: result.conflict
        ? "CONFLICT"
        : result.status === "AVAILABLE"
          ? "KNOWN"
          : languageKnown
            ? "PARTIAL"
            : "MISSING",
    };
  });
}

export const CANDIDATE_NARRATIVE_PROMPTS = [
  {
    theme: "PROFESSIONAL_CONTEXT" as const,
    title: "What your résumé misses",
    prompt:
      "Tell RoleProwl about your strongest capabilities, the roles you want, and the environments in which you work best.",
  },
  {
    theme: "RECURRING_DETAILS" as const,
    title: "Recurring application details",
    prompt:
      "Add practical details employers often ask for, such as language proficiency, work authorization, sponsorship, current work situation, notice period, relocation, or travel.",
  },
  {
    theme: "RECURRING_PREFERENCES" as const,
    title: "Optional recurring preferences",
    prompt:
      "Describe how you generally want compensation, AI-assisted hiring, and data use handled. Each employer-specific consent remains your decision.",
  },
] as const;

export function candidateKnowledgeGapPrompts(
  coverage: readonly CandidateKnowledgeCoverageItem[],
) {
  const missing = coverage.filter(
    (item) => item.status === "MISSING" || item.status === "PARTIAL",
  );
  return CANDIDATE_NARRATIVE_PROMPTS.map((prompt) => ({
    ...prompt,
    concepts: missing
      .filter((item) => {
        const policy = candidateKnowledgePolicy(item.concept)!;
        if (prompt.theme === "PROFESSIONAL_CONTEXT")
          return policy.class === "REUSABLE_PERSONAL";
        if (prompt.theme === "RECURRING_PREFERENCES")
          return (
            policy.class === "CONSENT_PREFERENCE_ONLY" ||
            policy.candidateInputOptional
          );
        return (
          policy.class === "VOLATILE_CONSEQUENTIAL" &&
          !policy.candidateInputOptional
        );
      })
      .map((item) => item.concept),
  })).filter((prompt) => prompt.concepts.length > 0);
}

export function employerSpecificConsentFromGeneralPreference() {
  return false as const;
}
