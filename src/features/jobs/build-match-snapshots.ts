import type { Prisma } from "@/generated/prisma/client";
import type {
  CandidateMatchSnapshot,
  JobMatchSnapshot,
  SkillRequirement,
} from "@/core/domain/matching/match-job";

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

function explicitSkillRequirements(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return null;
  const skills: SkillRequirement[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (item.type !== "SKILL" || typeof item.name !== "string") continue;
    skills.push({
      name: item.name,
      minimumExperienceMonths:
        typeof item.minimumExperienceMonths === "number"
          ? item.minimumExperienceMonths
          : null,
      minimumProficiency:
        item.minimumProficiency === "FAMILIAR" ||
        item.minimumProficiency === "WORKING" ||
        item.minimumProficiency === "ADVANCED" ||
        item.minimumProficiency === "EXPERT"
          ? item.minimumProficiency
          : null,
    });
  }
  return skills.length ? skills : null;
}

function monthsBetween(start: Date, end: Date) {
  return Math.max(
    0,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      end.getUTCMonth() -
      start.getUTCMonth(),
  );
}

export function buildCandidateMatchSnapshot(
  input: {
    readonly skills: readonly {
      canonicalName: string;
      proficiency: string | null;
      experienceMonths: number | null;
    }[];
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
  const remote = input.preferences?.remotePreference?.toUpperCase();
  return {
    authorizationCountries:
      input.authorization && explicitlyAuthorized
        ? [input.authorization.countryCode]
        : null,
    requiresSponsorship: input.authorization?.requiresSponsorship ?? null,
    clearances: null,
    languages: null,
    licenses: null,
    locationExclusions: null,
    requiredSalaryMinimum: input.preferences?.salaryMinimum ?? null,
    skills: input.skills.map((skill) => ({
      name: skill.canonicalName,
      proficiency:
        skill.proficiency === "FAMILIAR" ||
        skill.proficiency === "WORKING" ||
        skill.proficiency === "ADVANCED" ||
        skill.proficiency === "EXPERT"
          ? skill.proficiency
          : null,
      experienceMonths: skill.experienceMonths,
    })),
    experienceMonths: input.workExperiences.length
      ? input.workExperiences.reduce(
          (total, work) =>
            total + monthsBetween(work.startDate, work.endDate ?? now),
          0,
        )
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
  readonly salaryMax: { toNumber(): number } | null;
  readonly seniority: string | null;
}): JobMatchSnapshot {
  const authorization = object(job.workAuthorization);
  const sponsorship = object(job.sponsorship);
  const experience = object(job.experienceRequirements);
  const explicitlyRequired = explicitSkillRequirements(job.requirements);
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
    requiredSkills: explicitlyRequired,
    preferredSkills:
      explicitSkillRequirements(job.preferredRequirements) ??
      generalSkills?.map((name) => ({
        name,
        minimumExperienceMonths: null,
        minimumProficiency: null,
      })) ??
      null,
    excludedSkills: null,
    minimumExperienceMonths:
      typeof experience?.minimumMonths === "number"
        ? experience.minimumMonths
        : null,
    roleFamily: null,
    industry: null,
    educationLevels: stringArray(job.educationRequirements),
    seniority: job.seniority,
    remoteType: job.remoteType,
  };
}
