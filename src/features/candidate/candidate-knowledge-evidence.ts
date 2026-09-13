import {
  isCandidateKnowledgeConcept,
  jurisdictionCandidateKnowledgeConcept,
  legacyUsCandidateKnowledgeAlias,
  normalizeLanguageKey,
  type CandidateKnowledgeEvidence,
  type CandidateKnowledgeOrigin,
} from "@/core/domain/candidate/candidate-knowledge";

type Dated = { readonly id: string; readonly updatedAt: Date };

export interface CandidateKnowledgeSources {
  readonly profile:
    | (Dated & {
        readonly firstName: string;
        readonly lastName: string;
        readonly applicationEmail: string | null;
        readonly phone: string | null;
        readonly location: string | null;
        readonly websiteUrl: string | null;
        readonly linkedInUrl: string | null;
      })
    | null;
  readonly experiences: readonly (Dated & Record<string, unknown>)[];
  readonly education: readonly (Dated & Record<string, unknown>)[];
  readonly skills: readonly (Dated & Record<string, unknown>)[];
  readonly projects: readonly (Dated & Record<string, unknown>)[];
  readonly credentials: readonly (Dated & Record<string, unknown>)[];
  readonly verifiedResumeFacts: readonly {
    readonly id: string;
    readonly factType: string;
    readonly value: unknown;
    readonly updatedAt: Date;
  }[];
  readonly preferences:
    | (Dated & {
        readonly roleFamilies: readonly string[];
        readonly remotePreference: string | null;
        readonly salaryMinimum: number | null;
        readonly salaryCurrency: string | null;
        readonly maximumTravelPercent: number | null;
        readonly willingToRelocate: boolean | null;
      })
    | null;
  readonly authorization:
    | (Dated & {
        readonly countryCode: string;
        readonly authorizationStatus: string;
        readonly requiresSponsorship: boolean;
      })
    | null;
  readonly memories: readonly {
    readonly id: string;
    readonly concept: string;
    readonly answer: unknown;
    readonly autoAnswerAllowed: boolean;
    readonly origin: "EXPLICIT" | "DERIVED";
    readonly candidateApproved: boolean;
    readonly reusable: boolean;
    readonly verifiedAt: Date;
  }[];
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function text(value: unknown) {
  const candidate = record(value)?.text;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function evidence(
  input: Omit<
    CandidateKnowledgeEvidence,
    "autoAnswerAllowed" | "candidateApproved" | "reusable"
  >,
) {
  return {
    ...input,
    autoAnswerAllowed: true,
    candidateApproved: true,
    reusable: true,
  };
}

function scalarEvidence(input: {
  concept: CandidateKnowledgeEvidence["concept"];
  confirmedAt: Date;
  source: CandidateKnowledgeEvidence["source"];
  sourceId: string;
  value: unknown;
  origin?: CandidateKnowledgeOrigin;
}) {
  if (input.value === null || input.value === undefined || input.value === "")
    return null;
  return evidence({
    concept: input.concept,
    confirmedAt: input.confirmedAt,
    source: input.source,
    sourceId: input.sourceId,
    origin: input.origin ?? "EXPLICIT",
    value:
      typeof input.value === "string"
        ? { text: input.value.trim() }
        : { value: input.value },
  });
}

const FACT_CONCEPTS = {
  PROFILE_EMAIL: "APPLICATION_EMAIL",
  PROFILE_LOCATION: "CURRENT_LOCATION",
  WORK_EXPERIENCE_TEXT: "EMPLOYMENT_HISTORY",
  EDUCATION_TEXT: "EDUCATION_HISTORY",
  SKILL_TEXT: "SKILLS",
  PROJECT_TEXT: "PROJECTS",
  CREDENTIAL_TEXT: "CERTIFICATIONS",
} as const;

function languageEvidence(
  fact: CandidateKnowledgeSources["verifiedResumeFacts"][number],
) {
  if (fact.factType !== "LANGUAGE_TEXT") return [];
  const sourceText = text(fact.value);
  if (!sourceText) return [];
  const parts = sourceText
    .split(/\s*(?:—|–|:|\||\(|\))\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const language = parts[0];
  const languageKey = language ? normalizeLanguageKey(language) : "";
  if (!languageKey) return [];
  const items: CandidateKnowledgeEvidence[] = [
    evidence({
      concept: `LANGUAGE:${languageKey}`,
      confirmedAt: fact.updatedAt,
      source: "RESUME",
      sourceId: fact.id,
      origin: "DERIVED",
      value: { language, normalizedLanguage: languageKey },
    }),
  ];
  if (parts[1]) {
    items.push(
      evidence({
        concept: `LANGUAGE_PROFICIENCY:${languageKey}`,
        confirmedAt: fact.updatedAt,
        source: "RESUME",
        sourceId: fact.id,
        origin: "EXPLICIT",
        value: { language, proficiency: parts.slice(1).join(" ") },
      }),
    );
  }
  return items;
}

export function evidenceFromCandidateSources(
  sources: CandidateKnowledgeSources,
): CandidateKnowledgeEvidence[] {
  const items: CandidateKnowledgeEvidence[] = [];
  const profile = sources.profile;
  if (profile) {
    const fields = [
      ["FIRST_NAME", profile.firstName],
      ["LAST_NAME", profile.lastName],
      ["APPLICATION_EMAIL", profile.applicationEmail],
      ["PHONE", profile.phone],
      ["CURRENT_LOCATION", profile.location],
      ["WEBSITE_URL", profile.websiteUrl],
      ["LINKEDIN_URL", profile.linkedInUrl],
    ] as const;
    for (const [concept, value] of fields) {
      const item = scalarEvidence({
        concept,
        confirmedAt: profile.updatedAt,
        source: "PROFILE",
        sourceId: profile.id,
        value,
      });
      if (item) items.push(item);
    }
  }

  const collections = [
    ["EMPLOYMENT_HISTORY", sources.experiences],
    ["EDUCATION_HISTORY", sources.education],
    ["SKILLS", sources.skills],
    ["PROJECTS", sources.projects],
    ["CERTIFICATIONS", sources.credentials],
  ] as const;
  for (const [concept, values] of collections) {
    if (!values.length) continue;
    items.push(
      evidence({
        concept,
        confirmedAt: new Date(
          Math.max(...values.map((value) => value.updatedAt.getTime())),
        ),
        source: "TRUTH_VAULT",
        origin: "EXPLICIT",
        value: { recordIds: values.map((value) => value.id) },
      }),
    );
  }

  const currentExperience = sources.experiences.find(
    (experience) => experience.isCurrent === true,
  );
  if (currentExperience) {
    items.push(
      evidence({
        concept: "CURRENT_EMPLOYMENT_STATUS",
        confirmedAt: currentExperience.updatedAt,
        source: "TRUTH_VAULT",
        sourceId: currentExperience.id,
        origin: "DERIVED",
        value: { status: "EMPLOYED" },
      }),
    );
  }

  for (const fact of sources.verifiedResumeFacts) {
    items.push(...languageEvidence(fact));
    const concept = FACT_CONCEPTS[fact.factType as keyof typeof FACT_CONCEPTS];
    const factText = text(fact.value);
    if (!concept || !factText) continue;
    items.push(
      evidence({
        concept,
        confirmedAt: fact.updatedAt,
        source: "RESUME",
        sourceId: fact.id,
        origin:
          fact.factType === "PROFILE_EMAIL" ||
          fact.factType === "PROFILE_LOCATION"
            ? "DERIVED"
            : "EXPLICIT",
        value: {
          text:
            fact.factType === "PROFILE_EMAIL"
              ? factText.toLocaleLowerCase("en-US")
              : factText.replace(/\s+/gu, " "),
        },
      }),
    );
  }

  const preferences = sources.preferences;
  if (preferences) {
    const preferenceFields = [
      [
        "TARGET_ROLE",
        preferences.roleFamilies.length ? preferences.roleFamilies : null,
      ],
      ["REMOTE_PREFERENCE", preferences.remotePreference],
      [
        "DESIRED_SALARY",
        preferences.salaryMinimum == null
          ? null
          : {
              amount: preferences.salaryMinimum,
              currency: preferences.salaryCurrency,
              period: null,
            },
      ],
      ["TRAVEL_AVAILABILITY", preferences.maximumTravelPercent],
      ["WILLING_TO_RELOCATE", preferences.willingToRelocate],
    ] as const;
    for (const [concept, value] of preferenceFields) {
      const item = scalarEvidence({
        concept,
        confirmedAt: preferences.updatedAt,
        source: "CANDIDATE_DIRECT",
        sourceId: preferences.id,
        value,
      });
      if (item) items.push(item);
    }
  }

  if (sources.authorization) {
    const authorizationConcept = jurisdictionCandidateKnowledgeConcept(
      "WORK_AUTHORIZATION",
      sources.authorization.countryCode,
    );
    const sponsorshipConcept = jurisdictionCandidateKnowledgeConcept(
      "SPONSORSHIP_REQUIREMENT",
      sources.authorization.countryCode,
    );
    if (authorizationConcept && sponsorshipConcept)
      items.push(
        evidence({
          concept: authorizationConcept,
          confirmedAt: sources.authorization.updatedAt,
          source: "CANDIDATE_DIRECT",
          sourceId: sources.authorization.id,
          origin: "EXPLICIT",
          value: { status: sources.authorization.authorizationStatus },
        }),
        evidence({
          concept: sponsorshipConcept,
          confirmedAt: sources.authorization.updatedAt,
          source: "CANDIDATE_DIRECT",
          sourceId: sources.authorization.id,
          origin: "EXPLICIT",
          value: { required: sources.authorization.requiresSponsorship },
        }),
      );
  }

  for (const memory of sources.memories) {
    const answer = record(memory.answer);
    if (!answer || !isCandidateKnowledgeConcept(memory.concept)) continue;
    const item: CandidateKnowledgeEvidence = {
      concept: memory.concept,
      confirmedAt: memory.verifiedAt,
      source: "ANSWER_MEMORY",
      sourceId: memory.id,
      origin: memory.origin,
      autoAnswerAllowed: memory.autoAnswerAllowed,
      candidateApproved: memory.candidateApproved,
      reusable: memory.reusable,
      value: answer,
    };
    items.push(item);
  }
  for (const item of [...items]) {
    const alias = legacyUsCandidateKnowledgeAlias(item.concept);
    if (
      alias &&
      !items.some(
        (candidate) =>
          candidate.concept === alias &&
          candidate.source === item.source &&
          candidate.sourceId === item.sourceId,
      )
    )
      items.push({ ...item, concept: alias });
  }
  return items;
}
