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

export type MatchAssessment =
  "SUPPORTED" | "PARTIAL" | "GAP" | "CONFLICT" | "UNKNOWN";

export interface MatchEvidence {
  readonly assessment?: MatchAssessment;
  readonly category?: "QUALIFICATION" | "PREFERENCE";
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
  readonly scoringVersion: "match-v1.1";
  readonly strengths: readonly MatchEvidence[];
  readonly unknowns: readonly MatchEvidence[];
}

export const MATCH_SCORING_VERSION = "match-v1.1" as const;
// A High-fit label needs at least half of the job's relevant signals to be
// assessable. Lower coverage remains useful, but is explicitly preliminary.
export const MINIMUM_HIGH_FIT_EVIDENCE_COVERAGE = 0.5;

export function hasSufficientEvidenceForHighFit(confidence: number) {
  return confidence >= MINIMUM_HIGH_FIT_EVIDENCE_COVERAGE;
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
      outcome: "UNKNOWN" as const,
      evidence: "No verified candidate skill evidence yet",
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
      assessment: "CONFLICT",
      category: "QUALIFICATION",
      code: "CONTRADICTORY_JOB_REQUIREMENTS",
      label: "The job both requires and excludes the same skill",
      evidence: contradictory,
    });
  }

  if (job.authorizationCountries?.length) {
    possibleSignals += 1;
  }
  if (
    job.authorizationCountries?.length &&
    candidate.authorizationCountries === null
  ) {
    unknowns.push({
      assessment: "UNKNOWN",
      category: "QUALIFICATION",
      code: "AUTHORIZATION_UNKNOWN",
      label: "Work authorization cannot be confirmed",
      evidence: "Candidate or job authorization data is missing",
    });
  } else if (job.authorizationCountries?.length) {
    const authorized = job.authorizationCountries.some((country) =>
      includesNormalized(candidate.authorizationCountries, country),
    );
    if (authorized) {
      knownSignals += 1;
    } else if (candidate.requiresSponsorship === false) {
      knownSignals += 1;
      hardConflicts.push({
        assessment: "CONFLICT",
        category: "QUALIFICATION",
        code: "WORK_AUTHORIZATION_CONFLICT",
        label: "Work authorization conflicts with the role",
        evidence: `Role countries: ${job.authorizationCountries.join(", ")}`,
      });
    } else if (
      !authorized &&
      candidate.requiresSponsorship === true &&
      job.sponsorshipAvailable === false
    ) {
      knownSignals += 1;
      hardConflicts.push({
        assessment: "CONFLICT",
        category: "QUALIFICATION",
        code: "SPONSORSHIP_CONFLICT",
        label: "Sponsorship is required but unavailable",
        evidence:
          "Candidate requires sponsorship; job explicitly does not offer it",
      });
    } else if (
      candidate.requiresSponsorship === true &&
      job.sponsorshipAvailable === true
    ) {
      knownSignals += 1;
    } else {
      unknowns.push({
        assessment: "UNKNOWN",
        category: "QUALIFICATION",
        code: "SPONSORSHIP_UNKNOWN",
        label: "Sponsorship availability is unknown",
        evidence:
          candidate.requiresSponsorship === null
            ? "Candidate sponsorship needs are not recorded"
            : "The source did not specify sponsorship",
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
        assessment: "UNKNOWN",
        category: "QUALIFICATION",
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
        assessment: "CONFLICT",
        category: "QUALIFICATION",
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
        assessment: "CONFLICT",
        category: "QUALIFICATION",
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
        assessment: "UNKNOWN",
        category: "PREFERENCE",
        code: "COMPENSATION_UNKNOWN",
        label: "Maximum compensation is unknown",
        evidence: "The source did not specify salary",
      });
    } else {
      knownSignals += 1;
      if (job.maximumSalary < candidate.requiredSalaryMinimum) {
        hardConflicts.push({
          assessment: "CONFLICT",
          category: "PREFERENCE",
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
    const item = {
      assessment: "UNKNOWN" as MatchEvidence["assessment"],
      category: "QUALIFICATION" as const,
      code: `REQUIRED_SKILL_${normalizeSkillName(requirement.name)}`,
      label: `Required skill: ${requirement.name}`,
      evidence: result.evidence,
    };
    if (result.outcome === "STRENGTH") {
      item.assessment = "SUPPORTED";
      requiredPoints += 1;
      requiredEarned += 1;
      knownSignals += 1;
      strengths.push(item);
    } else if (result.outcome === "PARTIAL") {
      item.assessment = "PARTIAL";
      requiredPoints += 1;
      requiredEarned += 0.5;
      knownSignals += 1;
      partialMatches.push(item);
    } else if (result.outcome === "UNKNOWN") unknowns.push(item);
    else {
      item.assessment = "GAP";
      requiredPoints += 1;
      knownSignals += 1;
      gaps.push(item);
    }
  }

  let preferredPoints = 0;
  let preferredEarned = 0;
  for (const requirement of job.preferredSkills ?? []) {
    possibleSignals += 1;
    const result = evaluateSkill(requirement, candidate.skills);
    const item = {
      assessment: "UNKNOWN" as MatchEvidence["assessment"],
      category: "QUALIFICATION" as const,
      code: `PREFERRED_SKILL_${normalizeSkillName(requirement.name)}`,
      label: `Preferred skill: ${requirement.name}`,
      evidence: result.evidence,
    };
    if (result.outcome === "STRENGTH") {
      item.assessment = "SUPPORTED";
      preferredPoints += 1;
      knownSignals += 1;
      preferredEarned += 1;
      strengths.push(item);
    } else if (result.outcome === "PARTIAL") {
      item.assessment = "PARTIAL";
      preferredPoints += 1;
      knownSignals += 1;
      preferredEarned += 0.5;
      partialMatches.push(item);
    } else if (result.outcome === "UNKNOWN") unknowns.push(item);
    else {
      item.assessment = "GAP";
      preferredPoints += 1;
      knownSignals += 1;
      gaps.push(item);
    }
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
    if (candidateValue === null) {
      unknowns.push({
        assessment: "UNKNOWN",
        category: "QUALIFICATION",
        code: `${code}_UNKNOWN`,
        label: `${code.toLowerCase().replaceAll("_", " ")} is unknown`,
        evidence: "Candidate evidence is missing",
      });
      continue;
    }
    knownSignals += 1;
    otherPoints += 1;
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
      assessment: matches ? ("SUPPORTED" as const) : ("GAP" as const),
      category: "QUALIFICATION" as const,
      code,
      label: code.toLowerCase().replaceAll("_", " "),
      evidence: String(requirement),
    };
    if (matches) {
      otherEarned += 1;
      strengths.push(item);
    } else gaps.push(item);
  }

  const requiredScore = requiredPoints ? requiredEarned / requiredPoints : 0;
  const preferredScore = preferredPoints
    ? preferredEarned / preferredPoints
    : 0;
  const otherScore = otherPoints ? otherEarned / otherPoints : 0;
  const qualificationGroups = [
    { points: requiredPoints, score: requiredScore, weight: 0.6 },
    { points: preferredPoints, score: preferredScore, weight: 0.15 },
    { points: otherPoints, score: otherScore, weight: 0.25 },
  ].filter((group) => group.points > 0);
  const qualificationWeight = qualificationGroups.reduce(
    (total, group) => total + group.weight,
    0,
  );
  const qualificationScore = qualificationWeight
    ? Math.round(
        (qualificationGroups.reduce(
          (total, group) => total + group.score * group.weight,
          0,
        ) /
          qualificationWeight) *
          100,
      )
    : 50;

  const preferences: boolean[] = [];
  const preferenceChecks = [
    ["ROLE_PREFERENCE", job.roleFamily, candidate.preferredRoleFamilies],
    ["REMOTE_PREFERENCE", job.remoteType, candidate.preferredRemoteTypes],
    ["INDUSTRY_PREFERENCE", job.industry, candidate.preferredIndustries],
  ] as const;
  for (const [code, requirement, preferred] of preferenceChecks) {
    if (!requirement) continue;
    possibleSignals += 1;
    if (preferred === null) {
      unknowns.push({
        assessment: "UNKNOWN",
        category: "PREFERENCE",
        code: `${code}_UNKNOWN`,
        label: `${code.toLowerCase().replaceAll("_", " ")} is unknown`,
        evidence: "No candidate preference has been recorded yet",
      });
      continue;
    }
    knownSignals += 1;
    const matches = preferred.some(
      (value) => norm(value) === norm(requirement),
    );
    preferences.push(matches);
    const item: MatchEvidence = {
      assessment: matches ? "SUPPORTED" : "GAP",
      category: "PREFERENCE",
      code,
      label: code.toLowerCase().replaceAll("_", " "),
      evidence: String(requirement),
    };
    (matches ? strengths : gaps).push(item);
  }
  if (job.locations?.length) {
    possibleSignals += 1;
    if (candidate.preferredLocations === null) {
      unknowns.push({
        assessment: "UNKNOWN",
        category: "PREFERENCE",
        code: "LOCATION_PREFERENCE_UNKNOWN",
        label: "location preference is unknown",
        evidence: "No candidate location preference has been recorded yet",
      });
    } else {
      knownSignals += 1;
      const matches = job.locations.some((location) =>
        includesNormalized(candidate.preferredLocations, location),
      );
      preferences.push(matches);
      const item: MatchEvidence = {
        assessment: matches ? "SUPPORTED" : "GAP",
        category: "PREFERENCE",
        code: "LOCATION_PREFERENCE",
        label: "location preference",
        evidence: job.locations.join(", "),
      };
      (matches ? strengths : gaps).push(item);
    }
  }
  const preferenceScore = preferences.length
    ? Math.round(
        (preferences.filter(Boolean).length / preferences.length) * 100,
      )
    : 50;
  const hasQualificationEvidence = qualificationGroups.length > 0;
  const hasPreferenceEvidence = preferences.length > 0;
  const unconstrainedOverall =
    hasQualificationEvidence && hasPreferenceEvidence
      ? Math.round(qualificationScore * 0.75 + preferenceScore * 0.25)
      : hasQualificationEvidence
        ? qualificationScore
        : hasPreferenceEvidence
          ? preferenceScore
          : 50;
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
    scoringVersion: MATCH_SCORING_VERSION,
  };
}
