import type { Prisma } from "@/generated/prisma/client";
import type {
  CandidateMatchSnapshot,
  JobEvidenceOrigin,
  JobMatchSnapshot,
  OtherJobCriterion,
  SkillRequirement,
} from "@/core/domain/matching/match-job";
import { normalizeSkillName } from "@/core/domain/candidate/truth-vault";

function stringArray(value: Prisma.JsonValue | null): string[] | null {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : null;
}

function object(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

function criterionOrigin(value: unknown): JobEvidenceOrigin {
  return value === "SOURCE_TEXT_EXPLICIT" || value === "SAFE_CANONICALIZATION"
    ? value
    : "SOURCE_STRUCTURED_FIELD";
}

function criterionCode(statement: string, index: number) {
  const normalized = statement
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_|_$/gu, "")
    .slice(0, 64);
  return `EXPLICIT_CRITERION_${normalized || index}`;
}

function requirementSet(
  value: Prisma.JsonValue | null,
  field: "requirements" | "preferredRequirements",
) {
  const skills: SkillRequirement[] = [];
  const other: OtherJobCriterion[] = [];
  const otherStatements = new Set<string>();
  let minimumExperienceMonths: number | null = null;
  if (!Array.isArray(value))
    return { skills: null, other: null, minimumExperienceMonths };
  value.forEach((item, index) => {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, Prisma.JsonValue>)
        : null;
    const statement =
      typeof item === "string"
        ? item.trim()
        : typeof record?.statement === "string"
          ? record.statement.trim()
          : typeof record?.sourceText === "string"
            ? record.sourceText.trim()
            : "";
    const kind =
      typeof record?.kind === "string"
        ? record.kind
        : typeof record?.type === "string"
          ? record.type
          : "OTHER";
    const evidence = {
      field:
        typeof record?.sourceField === "string" ? record.sourceField : field,
      origin: criterionOrigin(record?.origin),
      ...(statement ? { statement } : {}),
    };
    const name =
      typeof record?.skillName === "string"
        ? record.skillName
        : typeof record?.name === "string"
          ? record.name
          : typeof record?.value === "string" && kind === "SKILL"
            ? record.value
            : null;
    const contextOnly = record?.evaluationMode === "CONTEXT_ONLY";
    if (kind === "SKILL" && name?.trim() && !contextOnly) {
      skills.push({
        name: name.trim(),
        minimumExperienceMonths:
          typeof record?.minimumExperienceMonths === "number"
            ? record.minimumExperienceMonths
            : null,
        minimumProficiency:
          record?.minimumProficiency === "FAMILIAR" ||
          record?.minimumProficiency === "WORKING" ||
          record?.minimumProficiency === "ADVANCED" ||
          record?.minimumProficiency === "EXPERT"
            ? record.minimumProficiency
            : null,
        evidence,
        statement: statement || name.trim(),
      });
      return;
    }
    if (
      kind === "EXPERIENCE" &&
      typeof record?.minimumExperienceMonths === "number"
    ) {
      minimumExperienceMonths = Math.max(
        minimumExperienceMonths ?? 0,
        record.minimumExperienceMonths,
      );
      return;
    }
    if (!statement || otherStatements.has(statement)) return;
    otherStatements.add(statement);
    other.push({
      code: criterionCode(statement, index),
      evidence,
      label: statement,
    });
  });
  return {
    skills: skills.length ? skills : null,
    other: other.length ? other : null,
    minimumExperienceMonths,
  };
}

function distinctExperienceMonths(
  work: readonly { startDate: Date; endDate: Date | null }[],
  now: Date,
) {
  const months = new Set<number>();
  for (const item of work) {
    const start =
      item.startDate.getUTCFullYear() * 12 + item.startDate.getUTCMonth();
    const endDate = item.endDate ?? now;
    const end = endDate.getUTCFullYear() * 12 + endDate.getUTCMonth();
    for (let month = start; month < end; month += 1) months.add(month);
  }
  return months.size;
}

export function buildCandidateMatchSnapshot(
  input: {
    readonly skills: readonly {
      canonicalName: string;
      proficiency: string | null;
      experienceMonths: number | null;
      evidenceCount?: number;
      evidence?: readonly {
        readonly evidenceId: string;
        readonly evidenceType: string;
        readonly id: string;
        readonly source: string;
      }[];
    }[];
    readonly projects?: readonly { readonly skills: readonly string[] }[];
    readonly workExperiences: readonly {
      startDate: Date;
      endDate: Date | null;
      isCurrent: boolean;
    }[];
    readonly educationRecords: readonly { credential: string | null }[];
    readonly preferences: {
      roleFamilies: readonly string[];
      industries: readonly string[];
      remotePreference: string | null;
      locationPreferences: readonly string[];
      salaryMinimum: number | null;
      employmentTypes?: readonly string[];
      seniorities?: readonly string[];
      exclusions?: readonly string[];
    } | null;
    readonly authorization: {
      countryCode: string;
      authorizationStatus: string;
      requiresSponsorship: boolean;
    } | null;
  },
  now = new Date(),
): CandidateMatchSnapshot {
  const authorizationStatus = input.authorization?.authorizationStatus
    .trim()
    .toLocaleLowerCase("en-US");
  const explicitlyAuthorized =
    authorizationStatus?.includes("authorized") &&
    !authorizationStatus.includes("not authorized");
  const explicitlyUnauthorized =
    authorizationStatus?.includes("not authorized") ||
    authorizationStatus?.includes("unauthorized");
  const remote = input.preferences?.remotePreference?.toUpperCase();
  const skills = new Map(
    input.skills.map((skill) => [
      normalizeSkillName(skill.canonicalName),
      skill,
    ]),
  );
  for (const projectSkill of input.projects?.flatMap(
    (project) => project.skills,
  ) ?? []) {
    const normalized = normalizeSkillName(projectSkill);
    if (normalized && !skills.has(normalized)) {
      skills.set(normalized, {
        canonicalName: projectSkill,
        proficiency: null,
        experienceMonths: null,
        evidenceCount: 0,
      });
    }
  }
  return {
    authorizationCountries: !input.authorization
      ? null
      : explicitlyAuthorized
        ? [input.authorization.countryCode]
        : explicitlyUnauthorized
          ? []
          : null,
    requiresSponsorship: input.authorization?.requiresSponsorship ?? null,
    clearances: null,
    languages: null,
    licenses: null,
    requiredSalaryMinimum: input.preferences?.salaryMinimum ?? null,
    skills: [...skills.values()].map((skill) => ({
      name: skill.canonicalName,
      proficiency:
        skill.proficiency === "FAMILIAR" ||
        skill.proficiency === "WORKING" ||
        skill.proficiency === "ADVANCED" ||
        skill.proficiency === "EXPERT"
          ? skill.proficiency
          : null,
      experienceMonths: skill.experienceMonths,
      evidenceCount: skill.evidence?.length ?? skill.evidenceCount,
      ...(skill.evidence?.length
        ? {
            evidence: skill.evidence.map((evidence) => ({
              evidenceId: evidence.evidenceId,
              evidenceType: evidence.evidenceType,
              field:
                evidence.evidenceType === "CANDIDATE_FACT"
                  ? `candidateFacts.${evidence.evidenceId}`
                  : `skillEvidence.${evidence.id}`,
              origin: "CANDIDATE_VERIFIED_FACT" as const,
              ...(evidence.source === "USER_ENTERED" ||
              evidence.source === "RESUME_EXTRACTED" ||
              evidence.source === "IMPORT" ||
              evidence.source === "SYSTEM_COMPUTED"
                ? { source: evidence.source }
                : {}),
            })),
          }
        : {}),
    })),
    experienceMonths: input.workExperiences.length
      ? distinctExperienceMonths(input.workExperiences, now)
      : null,
    roleFamilies: null,
    industries: null,
    educationLevels: input.educationRecords.length
      ? input.educationRecords
          .map((education) => education.credential)
          .filter((credential): credential is string => Boolean(credential))
      : null,
    seniority: null,
    preferredRoleFamilies: input.preferences?.roleFamilies ?? null,
    preferredRemoteTypes:
      remote === "REMOTE" || remote === "HYBRID" || remote === "ONSITE"
        ? [remote]
        : null,
    preferredIndustries: input.preferences?.industries ?? null,
    preferredLocations: input.preferences?.locationPreferences ?? null,
    preferredEmploymentTypes: input.preferences?.employmentTypes ?? null,
    preferredSeniorities: input.preferences?.seniorities ?? null,
    locationExclusions: input.preferences?.exclusions ?? null,
  };
}

export function buildJobMatchSnapshot(job: {
  readonly requirements: Prisma.JsonValue | null;
  readonly preferredRequirements: Prisma.JsonValue | null;
  readonly skills: Prisma.JsonValue | null;
  readonly educationRequirements: Prisma.JsonValue | null;
  readonly experienceRequirements: Prisma.JsonValue | null;
  readonly workAuthorization: Prisma.JsonValue | null;
  readonly sponsorship: Prisma.JsonValue | null;
  readonly locations: Prisma.JsonValue | null;
  readonly remoteType: "ONSITE" | "HYBRID" | "REMOTE" | null;
  readonly employmentType?: string | null;
  readonly salaryMax: { toNumber(): number } | null;
  readonly seniority: string | null;
}): JobMatchSnapshot {
  const authorization = object(job.workAuthorization);
  const sponsorship = object(job.sponsorship);
  const experience = object(job.experienceRequirements);
  const required = requirementSet(job.requirements, "requirements");
  const preferred = requirementSet(
    job.preferredRequirements,
    "preferredRequirements",
  );
  const generalSkills = stringArray(job.skills);
  return {
    authorizationCountries: stringArray(
      (authorization?.countries as Prisma.JsonValue | undefined) ?? null,
    ),
    sponsorshipAvailable:
      typeof sponsorship?.available === "boolean"
        ? sponsorship.available
        : null,
    requiredClearance:
      typeof authorization?.requiredClearance === "string"
        ? authorization.requiredClearance
        : null,
    requiredLanguages: null,
    requiredLicenses: null,
    locations: stringArray(job.locations),
    maximumSalary: job.salaryMax?.toNumber() ?? null,
    requiredSkills: required.skills,
    preferredSkills:
      preferred.skills ??
      generalSkills?.map((name) => ({
        name,
        minimumExperienceMonths: null,
        minimumProficiency: null,
        evidence: {
          field: "skills",
          origin: "SOURCE_STRUCTURED_FIELD" as const,
          statement: name,
        },
      })) ??
      null,
    otherRequiredCriteria: required.other,
    otherPreferredCriteria: preferred.other,
    excludedSkills: null,
    minimumExperienceMonths:
      typeof experience?.minimumMonths === "number"
        ? experience.minimumMonths
        : required.minimumExperienceMonths,
    roleFamily: null,
    industry: null,
    educationLevels: stringArray(job.educationRequirements),
    seniority: job.seniority,
    remoteType: job.remoteType,
    employmentType: job.employmentType ?? null,
  };
}
