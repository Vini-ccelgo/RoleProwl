import { countryCodesExplicitlyNamed } from "./candidate-knowledge";
import { isSupportedProposalDestination } from "./proposal-destinations";

export const AUTO_INGEST_PROFILE_FACT_TYPES = [
  "PROFILE_FIRST_NAME",
  "PROFILE_LAST_NAME",
  "PROFILE_EMAIL",
  "PROFILE_PHONE",
  "PROFILE_LINKEDIN_URL",
  "PROFILE_WEBSITE_URL",
  "PROFILE_LOCATION",
  "PROFILE_COUNTRY",
  "PROFILE_PROFESSIONAL_TITLE",
] as const;

export const AUTO_INGEST_COLLECTION_FACT_TYPES = [
  "WORK_EXPERIENCE_TEXT",
  "EDUCATION_TEXT",
  "SKILL_TEXT",
  "PROJECT_TEXT",
  "CREDENTIAL_TEXT",
  "LANGUAGE_TEXT",
] as const;

export type AutoIngestFactType =
  | (typeof AUTO_INGEST_PROFILE_FACT_TYPES)[number]
  | (typeof AUTO_INGEST_COLLECTION_FACT_TYPES)[number];

export interface SourceExplicitProposal {
  readonly confidence: number | null;
  readonly factType: string;
  readonly proposedValue: unknown;
  readonly sourceRegion: unknown;
  readonly targetPath: string;
}

export interface CandidateProfileConflictInput {
  readonly applicationEmail?: string | null;
  readonly countryCode?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly linkedInUrl?: string | null;
  readonly location?: string | null;
  readonly phone?: string | null;
  readonly professionalTitle?: string | null;
  readonly websiteUrl?: string | null;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export function resumeFactText(value: unknown) {
  const text = record(value).text;
  return typeof text === "string" ? text.trim() : "";
}

export function semanticResumeText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function equivalentResumeFactText(left: string, right: string) {
  return semanticResumeText(left) === semanticResumeText(right);
}

function supportedType(value: string): value is AutoIngestFactType {
  return (
    (AUTO_INGEST_PROFILE_FACT_TYPES as readonly string[]).includes(value) ||
    (AUTO_INGEST_COLLECTION_FACT_TYPES as readonly string[]).includes(value)
  );
}

function validUrl(value: string) {
  try {
    const parsed = new URL(
      /^https?:\/\//iu.test(value) ? value : `https://${value}`,
    );
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validValue(factType: AutoIngestFactType, value: string) {
  if (!value || value.length > 2_000) return false;
  if (factType === "PROFILE_FIRST_NAME" || factType === "PROFILE_LAST_NAME")
    return value.length <= 100 && /^[\p{L}][\p{L}'’ -]*$/u.test(value);
  if (factType === "PROFILE_EMAIL")
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
  if (factType === "PROFILE_PHONE") {
    const digits = value.replace(/\D/gu, "");
    return digits.length >= 8 && digits.length <= 15;
  }
  if (factType === "PROFILE_LINKEDIN_URL" || factType === "PROFILE_WEBSITE_URL")
    return value.length <= 500 && validUrl(value);
  if (factType === "PROFILE_COUNTRY")
    return (
      /^[A-Z]{2}$/u.test(value.toUpperCase()) ||
      countryCodesExplicitlyNamed(value).length === 1
    );
  return value.length <= 2_000;
}

const PROFILE_FIELD_BY_FACT_TYPE = {
  PROFILE_FIRST_NAME: "firstName",
  PROFILE_LAST_NAME: "lastName",
  PROFILE_EMAIL: "applicationEmail",
  PROFILE_PHONE: "phone",
  PROFILE_LINKEDIN_URL: "linkedInUrl",
  PROFILE_WEBSITE_URL: "websiteUrl",
  PROFILE_LOCATION: "location",
  PROFILE_COUNTRY: "countryCode",
  PROFILE_PROFESSIONAL_TITLE: "professionalTitle",
} as const satisfies Partial<
  Record<AutoIngestFactType, keyof CandidateProfileConflictInput>
>;

function countryCode(value: string) {
  if (/^[A-Z]{2}$/u.test(value.trim().toUpperCase()))
    return value.trim().toUpperCase();
  return countryCodesExplicitlyNamed(value)[0] ?? value;
}

function conflictsWithCandidateProfile(
  factType: AutoIngestFactType,
  value: string,
  profile: CandidateProfileConflictInput | null,
) {
  const field = PROFILE_FIELD_BY_FACT_TYPE[
    factType as keyof typeof PROFILE_FIELD_BY_FACT_TYPE
  ] as keyof CandidateProfileConflictInput | undefined;
  if (!field || !profile) return false;
  const current = profile[field];
  if (!current?.trim()) return false;
  const proposed = factType === "PROFILE_COUNTRY" ? countryCode(value) : value;
  return !equivalentResumeFactText(current, proposed);
}

export function isSourceExplicitAutoIngestProposal(input: {
  readonly proposal: SourceExplicitProposal;
  readonly peerProposals: readonly SourceExplicitProposal[];
  readonly profile: CandidateProfileConflictInput | null;
}) {
  const proposal = input.proposal;
  if (
    !supportedType(proposal.factType) ||
    !isSupportedProposalDestination(proposal.factType, proposal.targetPath)
  )
    return false;
  const value = resumeFactText(proposal.proposedValue);
  const sourceText = resumeFactText(proposal.sourceRegion);
  if (!validValue(proposal.factType, value) || !sourceText) return false;

  const profileFact = (
    AUTO_INGEST_PROFILE_FACT_TYPES as readonly string[]
  ).includes(proposal.factType);
  if (profileFact) {
    const minimumConfidence =
      proposal.factType === "PROFILE_FIRST_NAME" ||
      proposal.factType === "PROFILE_LAST_NAME"
        ? 0.85
        : 0.9;
    if ((proposal.confidence ?? 0) < minimumConfidence) return false;
    const distinctValues = new Set(
      input.peerProposals
        .filter((peer) => peer.factType === proposal.factType)
        .map((peer) => semanticResumeText(resumeFactText(peer.proposedValue)))
        .filter(Boolean),
    );
    if (distinctValues.size !== 1) return false;
    if (conflictsWithCandidateProfile(proposal.factType, value, input.profile))
      return false;
    return semanticResumeText(sourceText).includes(semanticResumeText(value));
  }

  return (
    (proposal.confidence ?? 0) >= 0.55 &&
    equivalentResumeFactText(sourceText, value)
  );
}

export function resumeCountryCode(value: string) {
  const code = countryCode(value);
  return /^[A-Z]{2}$/u.test(code) ? code : null;
}
