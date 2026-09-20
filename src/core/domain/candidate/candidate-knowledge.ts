export type CandidateKnowledgeClass =
  | "STABLE_FACT"
  | "REUSABLE_PERSONAL"
  | "VOLATILE_CONSEQUENTIAL"
  | "CONSENT_PREFERENCE_ONLY"
  | "CANDIDATE_AUTHORITY";

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
  "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
  "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
] as const;

export type StaticCandidateKnowledgeConcept =
  (typeof STATIC_CANDIDATE_KNOWLEDGE_CONCEPTS)[number];
export type CandidateKnowledgeConcept =
  | StaticCandidateKnowledgeConcept
  | `LANGUAGE:${string}`
  | `LANGUAGE_PROFICIENCY:${string}`
  | `WORK_AUTHORIZATION:${string}`
  | `SPONSORSHIP_REQUIREMENT:${string}`;

export const COLLECTION_CANDIDATE_KNOWLEDGE_CONCEPTS = [
  "EMPLOYMENT_HISTORY",
  "EDUCATION_HISTORY",
  "CERTIFICATIONS",
  "SKILLS",
  "PROJECTS",
] as const satisfies readonly CandidateKnowledgeConcept[];

export const DEFAULT_CANDIDATE_KNOWLEDGE_CONCEPTS =
  STATIC_CANDIDATE_KNOWLEDGE_CONCEPTS.filter(
    (concept) =>
      concept !== "US_WORK_AUTHORIZATION" &&
      concept !== "US_FUTURE_SPONSORSHIP",
  );

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
const CANDIDATE_AUTHORITY: CandidateKnowledgePolicy = {
  class: "CANDIDATE_AUTHORITY",
  candidateInputOptional: true,
  reverifyAfterDays: 30,
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
  PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION: CANDIDATE_AUTHORITY,
  NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION: CANDIDATE_AUTHORITY,
};

export const PROFESSIONAL_HISTORY_AUTHORITY_CONCEPTS = [
  "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
  "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
] as const satisfies readonly StaticCandidateKnowledgeConcept[];

export type ProfessionalHistoryAuthorityConcept =
  (typeof PROFESSIONAL_HISTORY_AUTHORITY_CONCEPTS)[number];

export function isProfessionalHistoryAuthorityConcept(
  concept: string,
): concept is ProfessionalHistoryAuthorityConcept {
  return PROFESSIONAL_HISTORY_AUTHORITY_CONCEPTS.includes(
    concept as ProfessionalHistoryAuthorityConcept,
  );
}

export function isValidCandidateKnowledgeAnswer(
  concept: CandidateKnowledgeConcept,
  answer: Readonly<Record<string, unknown>>,
) {
  if (!isProfessionalHistoryAuthorityConcept(concept))
    return Object.keys(answer).length > 0;
  const expectedKey =
    concept === "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION"
      ? "attested"
      : "authorized";
  return Object.keys(answer).length === 1 && answer[expectedKey] === true;
}

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
  if (
    concept.startsWith("WORK_AUTHORIZATION:") ||
    concept.startsWith("SPONSORSHIP_REQUIREMENT:")
  )
    return VOLATILE_90;
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
  if (
    concept.startsWith("WORK_AUTHORIZATION:") ||
    concept.startsWith("SPONSORSHIP_REQUIREMENT:")
  ) {
    const countryCode = concept.slice(concept.indexOf(":") + 1);
    return /^[A-Z]{2}$/u.test(countryCode);
  }
  return STATIC_CANDIDATE_KNOWLEDGE_CONCEPTS.includes(
    concept as StaticCandidateKnowledgeConcept,
  );
}

export function jurisdictionCandidateKnowledgeConcept(
  family: "WORK_AUTHORIZATION" | "SPONSORSHIP_REQUIREMENT",
  countryCode: string,
): CandidateKnowledgeConcept | null {
  const normalizedCountryCode = countryCode
    .normalize("NFKC")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/u.test(normalizedCountryCode)
    ? `${family}:${normalizedCountryCode}`
    : null;
}

export function legacyUsCandidateKnowledgeAlias(
  concept: CandidateKnowledgeConcept,
): CandidateKnowledgeConcept | null {
  if (concept === "US_WORK_AUTHORIZATION") return "WORK_AUTHORIZATION:US";
  if (concept === "US_FUTURE_SPONSORSHIP") return "SPONSORSHIP_REQUIREMENT:US";
  if (concept === "WORK_AUTHORIZATION:US") return "US_WORK_AUTHORIZATION";
  if (concept === "SPONSORSHIP_REQUIREMENT:US") return "US_FUTURE_SPONSORSHIP";
  return null;
}

export function countryCodesExplicitlyNamed(value: string) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-US");
  const countryCodes = new Set<string>();
  if (/\b(?:brazil|brasil)\b/iu.test(normalized)) countryCodes.add("BR");
  if (
    /\b(?:united states(?: of america)?|u\.s(?:\.a)?\.?|usa|estados unidos)(?=\W|$)/iu.test(
      normalized,
    )
  )
    countryCodes.add("US");
  return [...countryCodes];
}

export function jurisdictionConceptsExplicitlyNamed(
  value: string,
): CandidateKnowledgeConcept[] {
  const concepts = new Set<CandidateKnowledgeConcept>();
  const segments = value
    .normalize("NFKC")
    .split(/[.!?\n]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  for (const segment of segments) {
    const countryCodes = countryCodesExplicitlyNamed(segment);
    if (!countryCodes.length) continue;
    const authorization =
      /\b(?:authorized|authorization|eligible|permitted).{0,30}(?:work|employment)|\b(?:work|employment).{0,30}(?:authorized|authorization|eligible|permitted)|\bautoriza[cç][aã]o.{0,30}trabalh|\bautorizad[oa].{0,30}trabalh/iu.test(
        segment,
      );
    const sponsorship =
      /\b(?:sponsor|sponsorship|visa)|\bpatroc[ií]nio.{0,20}visto/iu.test(
        segment,
      );
    for (const countryCode of countryCodes) {
      if (authorization)
        concepts.add(
          `WORK_AUTHORIZATION:${countryCode}` as CandidateKnowledgeConcept,
        );
      if (sponsorship)
        concepts.add(
          `SPONSORSHIP_REQUIREMENT:${countryCode}` as CandidateKnowledgeConcept,
        );
    }
  }
  return [...concepts];
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

export function candidateKnowledgeSourceLabel(
  source: CandidateKnowledgeSource,
) {
  const labels: Readonly<Record<CandidateKnowledgeSource, string>> = {
    PROFILE: "Career profile",
    TRUTH_VAULT: "Career profile",
    RESUME: "Verified résumé fact",
    ANSWER_MEMORY: "Candidate answer",
    CANDIDATE_DIRECT: "Career profile",
    CANDIDATE_NARRATIVE: "Candidate narrative",
  };
  return labels[source];
}

export function candidateKnowledgeConflictSourceLabels(
  result: CandidateKnowledgeQueryResult,
) {
  return [
    ...new Set(
      result.conflictingEvidence.map((evidence) =>
        candidateKnowledgeSourceLabel(evidence.provenance.source),
      ),
    ),
  ].slice(0, 4);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
}

function sameValue(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
) {
  return (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
  );
}

function isCollectionConcept(concept: CandidateKnowledgeConcept) {
  return COLLECTION_CANDIDATE_KNOWLEDGE_CONCEPTS.includes(
    concept as (typeof COLLECTION_CANDIDATE_KNOWLEDGE_CONCEPTS)[number],
  );
}

interface CollectionEvidenceItem {
  readonly evidence: CandidateKnowledgeEvidence;
  readonly identity: string;
  readonly value: unknown;
}

function collectionItemIdentity(value: unknown, fallback: string) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    for (const key of ["identity", "semanticId", "key", "normalizedName"]) {
      const candidate = item[key];
      if (typeof candidate === "string" && candidate.trim())
        return `${key}:${candidate.normalize("NFKC").trim().toLocaleLowerCase("en-US")}`;
    }
    if (typeof item.name === "string" && item.name.trim())
      return `name:${item.name.normalize("NFKC").trim().toLocaleLowerCase("en-US")}`;
    if (typeof item.text === "string" && item.text.trim())
      return `text:${item.text.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US")}`;
  }
  if (typeof value === "string" && value.trim())
    return `text:${value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US")}`;
  return fallback;
}

function collectionEvidenceItems(
  evidence: CandidateKnowledgeEvidence,
): CollectionEvidenceItem[] {
  const items = Array.isArray(evidence.value.items)
    ? evidence.value.items
    : Array.isArray(evidence.value.recordIds)
      ? evidence.value.recordIds
      : [evidence.value];
  return items.map((value, index) => ({
    evidence,
    identity: collectionItemIdentity(
      value,
      `${evidence.source}:${evidence.sourceId ?? "NONE"}:${index}`,
    ),
    value,
  }));
}

function resolveCollectionKnowledge(input: {
  readonly concept: CandidateKnowledgeConcept;
  readonly policy: CandidateKnowledgePolicy;
  readonly ranked: readonly CandidateKnowledgeEvidence[];
  readonly now: Date;
}): CandidateKnowledgeQueryResult {
  const selected = input.ranked[0]!;
  const entries = input.ranked.flatMap(collectionEvidenceItems);
  const uniqueItems = [
    ...new Map(
      entries.map((entry) => [
        `${entry.identity}:${JSON.stringify(canonicalize(entry.value))}`,
        entry.value,
      ]),
    ).values(),
  ];
  const byIdentity = new Map<string, CollectionEvidenceItem[]>();
  for (const entry of entries)
    byIdentity.set(entry.identity, [
      ...(byIdentity.get(entry.identity) ?? []),
      entry,
    ]);
  const conflictingGroups = [...byIdentity.values()].filter(
    (items) =>
      new Set(items.map((item) => JSON.stringify(canonicalize(item.value))))
        .size > 1,
  );
  const conflictingEntries = conflictingGroups.flat();
  const alternativeEntries = conflictingEntries.filter(
    (item) => item.evidence !== selected,
  );
  const conflictingEvidence = [
    ...new Map(
      (alternativeEntries.length ? alternativeEntries : conflictingEntries).map(
        (item) => [
          `${item.evidence.source}:${item.evidence.sourceId ?? "NONE"}`,
          {
            confirmedAt: item.evidence.confirmedAt,
            origin: item.evidence.origin as Exclude<
              CandidateKnowledgeOrigin,
              "INFERRED"
            >,
            provenance: {
              source: item.evidence.source,
              sourceId: item.evidence.sourceId,
            },
            value: item.evidence.value,
          },
        ],
      ),
    ).values(),
  ];
  const isStale = stale(selected, input.policy, input.now);
  return {
    concept: input.concept,
    applicationUse: "REUSABLE_ANSWER",
    autoAnswerAllowed:
      selected.autoAnswerAllowed && input.policy.reusableForEmployerQuestions,
    status: isStale ? "STALE_CONFIRMATION_REQUIRED" : "AVAILABLE",
    value: { items: uniqueItems },
    provenance: { source: selected.source, sourceId: selected.sourceId },
    origin: selected.origin as Exclude<CandidateKnowledgeOrigin, "INFERRED">,
    candidateApproved: selected.candidateApproved,
    reusable: selected.reusable,
    freshness: isStale ? "STALE" : "NOT_APPLICABLE",
    confirmedAt: selected.confirmedAt,
    conflict: conflictingGroups.length > 0,
    conflictingEvidence,
  };
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
        policy.class === "CONSENT_PREFERENCE_ONLY" ||
        policy.class === "CANDIDATE_AUTHORITY"
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
  if (isCollectionConcept(input.concept))
    return resolveCollectionKnowledge({
      concept: input.concept,
      policy,
      ranked,
      now: input.now ?? new Date(),
    });
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
      policy.class === "CONSENT_PREFERENCE_ONLY" ||
      policy.class === "CANDIDATE_AUTHORITY"
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
  const usingDefaultConcepts = input.concepts === undefined;
  const concepts = new Set<CandidateKnowledgeConcept>(
    input.concepts ?? DEFAULT_CANDIDATE_KNOWLEDGE_CONCEPTS,
  );
  for (const evidence of input.evidence) {
    if (
      usingDefaultConcepts &&
      (evidence.concept === "US_WORK_AUTHORIZATION" ||
        evidence.concept === "US_FUTURE_SPONSORSHIP")
    )
      continue;
    concepts.add(evidence.concept);
  }
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
