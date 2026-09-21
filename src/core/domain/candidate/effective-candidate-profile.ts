import { resumeCountryCode, resumeFactText } from "./resume-auto-ingest";

export const EFFECTIVE_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "applicationEmail",
  "professionalTitle",
  "summary",
  "phone",
  "location",
  "countryCode",
  "websiteUrl",
  "linkedInUrl",
] as const;

export type EffectiveProfileField = (typeof EFFECTIVE_PROFILE_FIELDS)[number];

const FACT_FIELD = {
  PROFILE_FIRST_NAME: "firstName",
  PROFILE_LAST_NAME: "lastName",
  PROFILE_EMAIL: "applicationEmail",
  PROFILE_PROFESSIONAL_TITLE: "professionalTitle",
  PROFILE_PHONE: "phone",
  PROFILE_LOCATION: "location",
  PROFILE_COUNTRY: "countryCode",
  PROFILE_WEBSITE_URL: "websiteUrl",
  PROFILE_LINKEDIN_URL: "linkedInUrl",
} as const satisfies Partial<Record<string, EffectiveProfileField>>;

export interface EffectiveProfileFact {
  readonly factType: string;
  readonly id: string;
  readonly updatedAt: Date;
  readonly value: unknown;
  readonly sourceProposal?: {
    readonly document?: {
      readonly id: string;
      readonly originalFileName: string;
    };
  };
}

export interface EffectiveProfileSource {
  readonly kind: "CANDIDATE_PROFILE" | "RESUME";
  readonly id: string;
  readonly label: string;
  readonly updatedAt: Date;
}

export interface EffectiveProfileValue {
  readonly agreeingSources: readonly EffectiveProfileSource[];
  readonly conflicts: readonly {
    readonly source: EffectiveProfileSource;
    readonly value: string;
  }[];
  readonly source: EffectiveProfileSource | null;
  readonly value: string;
}

interface ProfileInput {
  readonly id: string;
  readonly updatedAt: Date;
  readonly source?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly applicationEmail: string | null;
  readonly professionalTitle: string | null;
  readonly summary: string | null;
  readonly phone: string | null;
  readonly location: string | null;
  readonly countryCode: string | null;
  readonly websiteUrl: string | null;
  readonly linkedInUrl: string | null;
}

function normalized(field: EffectiveProfileField, value: string) {
  const clean = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (field === "phone") return clean.replace(/\D/gu, "");
  if (field === "countryCode") return clean.toUpperCase();
  if (field === "websiteUrl" || field === "linkedInUrl") {
    try {
      const url = new URL(
        /^https?:\/\//iu.test(clean) ? clean : `https://${clean}`,
      );
      return `${url.hostname.toLocaleLowerCase("en-US")}${url.pathname.replace(/\/$/u, "")}${url.search}`;
    } catch {
      return clean;
    }
  }
  return clean.toLocaleLowerCase("en-US");
}

function profileValue(profile: ProfileInput, field: EffectiveProfileField) {
  const value = profile[field];
  return typeof value === "string" ? value.trim() : "";
}

function factValue(field: EffectiveProfileField, fact: EffectiveProfileFact) {
  const value = resumeFactText(fact.value);
  if (field === "countryCode") return resumeCountryCode(value) ?? "";
  if (
    (field === "websiteUrl" || field === "linkedInUrl") &&
    value &&
    !/^https?:\/\//iu.test(value)
  )
    return `https://${value}`;
  return value;
}

export function buildEffectiveCandidateProfile(input: {
  readonly profile: ProfileInput | null;
  readonly facts: readonly EffectiveProfileFact[];
}) {
  const values = Object.fromEntries(
    EFFECTIVE_PROFILE_FIELDS.map((field) => {
      const candidates = input.facts
        .filter(
          (fact) =>
            FACT_FIELD[fact.factType as keyof typeof FACT_FIELD] === field,
        )
        .map((fact) => ({
          value: factValue(field, fact),
          source: {
            kind: "RESUME" as const,
            id: fact.id,
            label: fact.sourceProposal?.document?.originalFileName
              ? `Imported from ${fact.sourceProposal.document.originalFileName}`
              : "Imported from résumé",
            updatedAt: fact.updatedAt,
          },
        }))
        .filter((candidate) => candidate.value)
        .sort(
          (left, right) =>
            right.source.updatedAt.getTime() - left.source.updatedAt.getTime(),
        );
      const current = input.profile ? profileValue(input.profile, field) : "";
      const profileSource =
        input.profile && current
          ? {
              kind: "CANDIDATE_PROFILE" as const,
              id: input.profile.id,
              label:
                input.profile.source === "RESUME_EXTRACTED"
                  ? "Imported from résumé"
                  : "Saved in Career Profile",
              updatedAt: input.profile.updatedAt,
            }
          : null;
      const selected = profileSource
        ? { value: current, source: profileSource }
        : (candidates[0] ?? null);
      const selectedSemantic = selected
        ? normalized(field, selected.value)
        : "";
      const agreeingSources = selected
        ? [
            selected.source,
            ...candidates
              .filter(
                (candidate) =>
                  candidate.source.id !== selected.source.id &&
                  normalized(field, candidate.value) === selectedSemantic,
              )
              .map((candidate) => candidate.source),
          ]
        : [];
      const conflicts = selected
        ? candidates.filter(
            (candidate) =>
              normalized(field, candidate.value) !== selectedSemantic,
          )
        : [];
      return [
        field,
        {
          value: selected?.value ?? "",
          source: selected?.source ?? null,
          agreeingSources,
          conflicts,
        } satisfies EffectiveProfileValue,
      ];
    }),
  ) as unknown as Record<EffectiveProfileField, EffectiveProfileValue>;
  return {
    values,
    populatedCount: EFFECTIVE_PROFILE_FIELDS.filter((field) =>
      Boolean(values[field].value),
    ).length,
    conflictCount: EFFECTIVE_PROFILE_FIELDS.filter(
      (field) => values[field].conflicts.length > 0,
    ).length,
  };
}

export type EffectiveCandidateProfile = ReturnType<
  typeof buildEffectiveCandidateProfile
>;
