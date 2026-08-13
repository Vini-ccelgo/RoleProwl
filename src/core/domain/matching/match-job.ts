import { normalizeSkillName } from "@/core/domain/candidate/truth-vault";

export interface CandidateSkillSnapshot {
  readonly name: string;
  readonly proficiency: "FAMILIAR" | "WORKING" | "ADVANCED" | "EXPERT" | null;
  readonly experienceMonths: number | null;
}

export interface CandidateMatchSnapshot {
  readonly authorizationCountries: readonly string[] | null;
  readonly clearances: readonly string[] | null;
  readonly educationLevels: readonly string[] | null;
  readonly experienceMonths: number | null;
  readonly industries: readonly string[] | null;
  readonly languages: readonly string[] | null;
  readonly licenses: readonly string[] | null;
  readonly locationExclusions: readonly string[] | null;
  readonly preferredIndustries: readonly string[] | null;
  readonly preferredLocations: readonly string[] | null;
  readonly preferredRemoteTypes:
    readonly ("ONSITE" | "HYBRID" | "REMOTE")[] | null;
  readonly preferredRoleFamilies: readonly string[] | null;
  readonly requiredSalaryMinimum: number | null;
  readonly requiresSponsorship: boolean | null;
  readonly roleFamilies: readonly string[] | null;
  readonly seniority: string | null;
  readonly skills: readonly CandidateSkillSnapshot[];
}

export interface SkillRequirement {
  readonly name: string;
  readonly minimumExperienceMonths: number | null;
  readonly minimumProficiency: CandidateSkillSnapshot["proficiency"];
}

export interface JobMatchSnapshot {
  readonly authorizationCountries: readonly string[] | null;
  readonly educationLevels: readonly string[] | null;
  readonly excludedSkills: readonly string[] | null;
  readonly industry: string | null;
  readonly locations: readonly string[] | null;
  readonly maximumSalary: number | null;
  readonly minimumExperienceMonths: number | null;
  readonly preferredSkills: readonly SkillRequirement[] | null;
  readonly remoteType: "ONSITE" | "HYBRID" | "REMOTE" | null;
  readonly requiredClearance: string | null;
  readonly requiredLanguages: readonly string[] | null;
  readonly requiredLicenses: readonly string[] | null;
  readonly requiredSkills: readonly SkillRequirement[] | null;
  readonly roleFamily: string | null;
  readonly seniority: string | null;
  readonly sponsorshipAvailable: boolean | null;
}

export interface MatchEvidence {
  readonly code: string;
  readonly evidence: string;
  readonly label: string;
}

export interface JobMatchResult {
  readonly confidence: number;
  readonly gaps: readonly MatchEvidence[];
  readonly hardConflicts: readonly MatchEvidence[];
  readonly overallFit: number;
  readonly partialMatches: readonly MatchEvidence[];
  readonly preferenceScore: number;
  readonly qualificationScore: number;
  readonly scoringVersion: "match-v1.0";
  readonly strengths: readonly MatchEvidence[];
  readonly unknowns: readonly MatchEvidence[];
}

const PROFICIENCY = {
  FAMILIAR: 1,
  WORKING: 2,
  ADVANCED: 3,
  EXPERT: 4,
} as const;
const norm = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
const includesNormalized = (values: readonly string[] | null, target: string) =>
  values?.some((value) => norm(value) === norm(target)) ?? false;

function evaluateSkill(
  requirement: SkillRequirement,
  candidateSkills: readonly CandidateSkillSnapshot[],
) {
  const requiredName = normalizeSkillName(requirement.name);
  const skill = candidateSkills.find(
    (candidate) => normalizeSkillName(candidate.name) === requiredName,
  );
  if (!skill)
    return {
      outcome: "GAP" as const,
      evidence: "No exact candidate skill evidence",
    };
  if (
    requirement.minimumProficiency &&
    (!skill.proficiency ||
      PROFICIENCY[skill.proficiency] <
        PROFICIENCY[requirement.minimumProficiency])
  ) {
    return {
      outcome: skill.proficiency ? ("PARTIAL" as const) : ("UNKNOWN" as const),
      evidence: skill.proficiency
        ? `${skill.proficiency.toLowerCase()} is below ${requirement.minimumProficiency.toLowerCase()}`
        : "Candidate proficiency is unknown",
    };
  }
  if (requirement.minimumExperienceMonths != null) {
    if (skill.experienceMonths == null) {
      return {
        outcome: "UNKNOWN" as const,
        evidence: "Skill duration is unknown",
      };
    }
    if (skill.experienceMonths < requirement.minimumExperienceMonths) {
      return {
        outcome: "PARTIAL" as const,
        evidence: `${skill.experienceMonths} documented months; ${requirement.minimumExperienceMonths} required`,
      };
    }
  }
  return {
    outcome: "STRENGTH" as const,
    evidence: `Exact evidence for ${skill.name}`,
  };
}

export function matchCandidateToJob(
  candidate: CandidateMatchSnapshot,
  job: JobMatchSnapshot,
): JobMatchResult {
  const strengths: MatchEvidence[] = [];
  const partialMatches: MatchEvidence[] = [];
  const gaps: MatchEvidence[] = [];
  const hardConflicts: MatchEvidence[] = [];
  const unknowns: MatchEvidence[] = [];
  let knownSignals = 0;
  let possibleSignals = 0;

  const requiredNames = new Set(
    (job.requiredSkills ?? []).map((skill) => normalizeSkillName(skill.name)),
  );
  const contradictory = (job.excludedSkills ?? []).find((skill) =>
    requiredNames.has(normalizeSkillName(skill)),
  );
  if (contradictory) {
    hardConflicts.push({
      code: "CONTRADICTORY_JOB_REQUIREMENTS",
      label: "The job both requires and excludes the same skill",
      evidence: contradictory,
    });
  }

  possibleSignals += 1;
  if (
    job.authorizationCountries === null ||
    candidate.authorizationCountries === null
  ) {
    unknowns.push({
      code: "AUTHORIZATION_UNKNOWN",
      label: "Work authorization cannot be confirmed",
      evidence: "Candidate or job authorization data is missing",
    });
  } else {
    knownSignals += 1;
    const authorized = job.authorizationCountries.some((country) =>
      includesNormalized(candidate.authorizationCountries, country),
    );
    if (!authorized && candidate.requiresSponsorship === false) {
      hardConflicts.push({
        code: "WORK_AUTHORIZATION_CONFLICT",
        label: "Work authorization conflicts with the role",
        evidence: `Role countries: ${job.authorizationCountries.join(", ")}`,
      });
    } else if (
      !authorized &&
      candidate.requiresSponsorship === true &&
      job.sponsorshipAvailable === false
    ) {
      hardConflicts.push({
        code: "SPONSORSHIP_CONFLICT",
        label: "Sponsorship is required but unavailable",
        evidence:
          "Candidate requires sponsorship; job explicitly does not offer it",
      });
    } else if (!authorized && job.sponsorshipAvailable === null) {
      unknowns.push({
        code: "SPONSORSHIP_UNKNOWN",
        label: "Sponsorship availability is unknown",
        evidence: "The source did not specify sponsorship",
      });
    }
  }

  for (const [code, required, held, label] of [
    [
      "CLEARANCE",
      job.requiredClearance ? [job.requiredClearance] : null,
      candidate.clearances,
      "clearance",
    ],
    ["LANGUAGE", job.requiredLanguages, candidate.languages, "language"],
    ["LICENSE", job.requiredLicenses, candidate.licenses, "license"],
  ] as const) {
    if (!required?.length) continue;
    possibleSignals += 1;
    if (held === null) {
      unknowns.push({
        code: `${code}_UNKNOWN`,
        label: `Required ${label} is unknown`,
        evidence: required.join(", "),
      });
      continue;
    }
    knownSignals += 1;
    const missing = required.filter(
      (value) => !includesNormalized(held, value),
    );
    if (missing.length)
      hardConflicts.push({
        code: `${code}_CONFLICT`,
        label: `Missing mandatory ${label}`,
        evidence: missing.join(", "),
      });
  }

  if (job.locations?.length && candidate.locationExclusions?.length) {
    possibleSignals += 1;
    knownSignals += 1;
    if (
      job.locations.every((location) =>
        includesNormalized(candidate.locationExclusions, location),
      )
    ) {
      hardConflicts.push({
        code: "LOCATION_CONFLICT",
        label: "Every listed job location is excluded",
        evidence: job.locations.join(", "),
      });
    }
  }
  if (candidate.requiredSalaryMinimum != null) {
    possibleSignals += 1;
    if (job.maximumSalary == null) {
      unknowns.push({
        code: "COMPENSATION_UNKNOWN",
        label: "Maximum compensation is unknown",
        evidence: "The source did not specify salary",
      });
    } else {
      knownSignals += 1;
      if (job.maximumSalary < candidate.requiredSalaryMinimum) {
        hardConflicts.push({
          code: "COMPENSATION_CONFLICT",
          label: "Maximum compensation is below the candidate minimum",
          evidence: `${job.maximumSalary} < ${candidate.requiredSalaryMinimum}`,
        });
      }
    }
  }

  let requiredPoints = 0;
  let requiredEarned = 0;
  for (const requirement of job.requiredSkills ?? []) {
    possibleSignals += 1;
    const result = evaluateSkill(requirement, candidate.skills);
    requiredPoints += 1;
    const item = {
      code: `REQUIRED_SKILL_${normalizeSkillName(requirement.name)}`,
      label: `Required skill: ${requirement.name}`,
      evidence: result.evidence,
    };
    if (result.outcome === "STRENGTH") {
      requiredEarned += 1;
      knownSignals += 1;
      strengths.push(item);
    } else if (result.outcome === "PARTIAL") {
      requiredEarned += 0.5;
      knownSignals += 1;
      partialMatches.push(item);
    } else if (result.outcome === "UNKNOWN") unknowns.push(item);
    else {
      knownSignals += 1;
      gaps.push(item);
    }
  }

  let preferredPoints = 0;
  let preferredEarned = 0;
  for (const requirement of job.preferredSkills ?? []) {
    possibleSignals += 1;
    knownSignals += 1;
    preferredPoints += 1;
    const result = evaluateSkill(requirement, candidate.skills);
    const item = {
      code: `PREFERRED_SKILL_${normalizeSkillName(requirement.name)}`,
      label: `Preferred skill: ${requirement.name}`,
      evidence: result.evidence,
    };
    if (result.outcome === "STRENGTH") {
      preferredEarned += 1;
      strengths.push(item);
    } else if (result.outcome === "PARTIAL") {
      preferredEarned += 0.5;
      partialMatches.push(item);
    } else gaps.push(item);
  }

  const qualificationChecks = [
    ["EXPERIENCE", job.minimumExperienceMonths, candidate.experienceMonths],
    ["SENIORITY", job.seniority, candidate.seniority],
    ["ROLE_FAMILY", job.roleFamily, candidate.roleFamilies],
    ["EDUCATION", job.educationLevels, candidate.educationLevels],
  ] as const;
  let otherEarned = 0;
  let otherPoints = 0;
  for (const [code, requirement, candidateValue] of qualificationChecks) {
    if (requirement === null) continue;
    possibleSignals += 1;
    otherPoints += 1;
    if (candidateValue === null) {
      unknowns.push({
        code: `${code}_UNKNOWN`,
        label: `${code.toLowerCase().replaceAll("_", " ")} is unknown`,
        evidence: "Candidate evidence is missing",
      });
      continue;
    }
    knownSignals += 1;
    let matches = false;
    if (code === "EXPERIENCE")
      matches = (candidateValue as number) >= (requirement as number);
    else if (Array.isArray(requirement))
      matches = requirement.some((value) =>
        includesNormalized(candidateValue as readonly string[], value),
      );
    else if (Array.isArray(candidateValue))
      matches = includesNormalized(candidateValue, requirement as string);
    else
      matches = norm(candidateValue as string) === norm(requirement as string);
    const item = {
      code,
      label: code.toLowerCase().replaceAll("_", " "),
      evidence: String(requirement),
    };
    if (matches) {
      otherEarned += 1;
      strengths.push(item);
    } else gaps.push(item);
  }

  const requiredScore = requiredPoints ? requiredEarned / requiredPoints : 1;
  const preferredScore = preferredPoints
    ? preferredEarned / preferredPoints
    : 1;
  const otherScore = otherPoints ? otherEarned / otherPoints : 1;
  const qualificationScore = Math.round(
    (requiredScore * 0.6 + preferredScore * 0.15 + otherScore * 0.25) * 100,
  );

  const preferences: boolean[] = [];
  if (job.roleFamily && candidate.preferredRoleFamilies)
    preferences.push(
      includesNormalized(candidate.preferredRoleFamilies, job.roleFamily),
    );
  if (job.remoteType && candidate.preferredRemoteTypes)
    preferences.push(candidate.preferredRemoteTypes.includes(job.remoteType));
  if (job.industry && candidate.preferredIndustries)
    preferences.push(
      includesNormalized(candidate.preferredIndustries, job.industry),
    );
  if (job.locations && candidate.preferredLocations)
    preferences.push(
      job.locations.some((location) =>
        includesNormalized(candidate.preferredLocations, location),
      ),
    );
  const preferenceScore = preferences.length
    ? Math.round(
        (preferences.filter(Boolean).length / preferences.length) * 100,
      )
    : 50;
  const unconstrainedOverall = Math.round(
    qualificationScore * 0.75 + preferenceScore * 0.25,
  );
  return {
    qualificationScore,
    preferenceScore,
    overallFit: hardConflicts.length
      ? Math.min(unconstrainedOverall, 20)
      : unconstrainedOverall,
    hardConflicts,
    strengths,
    partialMatches,
    gaps,
    unknowns,
    confidence: possibleSignals
      ? Math.round((knownSignals / possibleSignals) * 100) / 100
      : 0,
    scoringVersion: "match-v1.0",
  };
}
