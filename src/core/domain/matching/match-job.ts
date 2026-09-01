import { normalizeSkillName } from "@/core/domain/candidate/truth-vault";

export interface CandidateSkillSnapshot {
  readonly name: string;
  readonly proficiency: "FAMILIAR" | "WORKING" | "ADVANCED" | "EXPERT" | null;
  readonly experienceMonths: number | null;
  readonly evidenceCount?: number;
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
  readonly preferredEmploymentTypes?: readonly string[] | null;
  readonly preferredIndustries: readonly string[] | null;
  readonly preferredLocations: readonly string[] | null;
  readonly preferredRemoteTypes:
    readonly ("ONSITE" | "HYBRID" | "REMOTE")[] | null;
  readonly preferredRoleFamilies: readonly string[] | null;
  readonly preferredSeniorities?: readonly string[] | null;
  readonly requiredSalaryMinimum: number | null;
  readonly requiresSponsorship: boolean | null;
  readonly roleFamilies: readonly string[] | null;
  readonly seniority: string | null;
  readonly skills: readonly CandidateSkillSnapshot[];
}

export type JobEvidenceOrigin =
  "SOURCE_STRUCTURED_FIELD" | "SOURCE_TEXT_EXPLICIT" | "SAFE_CANONICALIZATION";

export interface JobEvidenceReference {
  readonly field: string;
  readonly origin: JobEvidenceOrigin;
  readonly statement?: string;
}

export interface CandidateEvidenceReference {
  readonly field: string;
  readonly origin:
    | "CANDIDATE_STRUCTURED_FIELD"
    | "CANDIDATE_VERIFIED_FACT"
    | "CANDIDATE_PREFERENCE";
}

export interface SkillRequirement {
  readonly name: string;
  readonly minimumExperienceMonths: number | null;
  readonly minimumProficiency: CandidateSkillSnapshot["proficiency"];
  readonly evidence?: JobEvidenceReference;
  readonly statement?: string;
}

export interface OtherJobCriterion {
  readonly code: string;
  readonly evidence: JobEvidenceReference;
  readonly label: string;
  readonly weight?: number;
}

export interface JobMatchSnapshot {
  readonly authorizationCountries: readonly string[] | null;
  readonly educationLevels: readonly string[] | null;
  readonly employmentType?: string | null;
  readonly excludedSkills: readonly string[] | null;
  readonly industry: string | null;
  readonly locations: readonly string[] | null;
  readonly maximumSalary: number | null;
  readonly minimumExperienceMonths: number | null;
  readonly otherPreferredCriteria?: readonly OtherJobCriterion[] | null;
  readonly otherRequiredCriteria?: readonly OtherJobCriterion[] | null;
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
  | "MATCH"
  | "PARTIAL_MATCH"
  | "SUPPORTED"
  | "PARTIAL"
  | "GAP"
  | "CONFLICT"
  | "UNKNOWN";

export interface MatchEvidence {
  readonly assessment?: MatchAssessment;
  readonly candidateEvidence?: readonly CandidateEvidenceReference[];
  readonly category?: "QUALIFICATION" | "PREFERENCE";
  readonly code: string;
  readonly criterionId?: string;
  readonly evidence: string;
  readonly hardConflict?: boolean;
  readonly jobEvidence?: JobEvidenceReference;
  readonly label: string;
  readonly weight?: number;
}

export interface JobMatchResult {
  readonly confidence: number;
  readonly conflicts: readonly MatchEvidence[];
  readonly evidenceCoverage: number;
  readonly gaps: readonly MatchEvidence[];
  readonly hardConflicts: readonly MatchEvidence[];
  readonly overallFit: number | null;
  readonly partialMatches: readonly MatchEvidence[];
  readonly preferenceScore: number | null;
  readonly qualificationScore: number | null;
  readonly scoringVersion: "match-v1.2";
  readonly strengths: readonly MatchEvidence[];
  readonly unknowns: readonly MatchEvidence[];
}

export const MATCH_SCORING_VERSION = "match-v1.2" as const;
export const MINIMUM_SCORE_EVIDENCE_COVERAGE = 0.5;
export const MINIMUM_HIGH_FIT_EVIDENCE_COVERAGE =
  MINIMUM_SCORE_EVIDENCE_COVERAGE;

export function hasSufficientEvidenceForHighFit(evidenceCoverage: number) {
  return evidenceCoverage >= MINIMUM_HIGH_FIT_EVIDENCE_COVERAGE;
}

const PROFICIENCY = {
  FAMILIAR: 1,
  WORKING: 2,
  ADVANCED: 3,
  EXPERT: 4,
} as const;

const WEIGHT = {
  HARD_REQUIREMENT: 3,
  REQUIREMENT: 2,
  PREFERRED_QUALIFICATION: 1,
  PREFERENCE: 1,
  HARD_PREFERENCE: 2,
} as const;

const norm = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

const includesNormalized = (values: readonly string[] | null, target: string) =>
  values?.some((value) => norm(value) === norm(target)) ?? false;

const jobReference = (
  field: string,
  statement?: string,
  origin: JobEvidenceOrigin = "SOURCE_STRUCTURED_FIELD",
): JobEvidenceReference => ({
  field,
  origin,
  ...(statement ? { statement } : {}),
});

const candidateReference = (
  field: string,
  origin: CandidateEvidenceReference["origin"] = "CANDIDATE_STRUCTURED_FIELD",
): CandidateEvidenceReference => ({ field, origin });

function skillResult(
  requirement: SkillRequirement,
  candidateSkills: readonly CandidateSkillSnapshot[],
) {
  const requiredName = normalizeSkillName(requirement.name);
  const skill = candidateSkills.find(
    (candidate) => normalizeSkillName(candidate.name) === requiredName,
  );
  if (!skill)
    return {
      assessment: "UNKNOWN" as const,
      evidence: "No sufficiently grounded candidate skill evidence is recorded",
      candidateEvidence: [] as CandidateEvidenceReference[],
    };

  const evidenceOrigin = skill.evidenceCount
    ? "CANDIDATE_VERIFIED_FACT"
    : "CANDIDATE_STRUCTURED_FIELD";
  const candidateEvidence = [
    candidateReference(`skills.${requiredName}`, evidenceOrigin),
  ];
  if (
    requirement.minimumProficiency &&
    (!skill.proficiency ||
      PROFICIENCY[skill.proficiency] <
        PROFICIENCY[requirement.minimumProficiency])
  ) {
    return {
      assessment: skill.proficiency
        ? ("PARTIAL_MATCH" as const)
        : ("UNKNOWN" as const),
      evidence: skill.proficiency
        ? `${skill.proficiency.toLowerCase()} is below ${requirement.minimumProficiency.toLowerCase()}`
        : "Candidate proficiency is not recorded",
      candidateEvidence,
    };
  }
  if (requirement.minimumExperienceMonths != null) {
    if (skill.experienceMonths == null) {
      return {
        assessment: "UNKNOWN" as const,
        evidence: "Candidate skill duration is not recorded",
        candidateEvidence,
      };
    }
    if (skill.experienceMonths < requirement.minimumExperienceMonths) {
      return {
        assessment: "PARTIAL_MATCH" as const,
        evidence: `${skill.experienceMonths} documented months; ${requirement.minimumExperienceMonths} required`,
        candidateEvidence,
      };
    }
  }
  return {
    assessment: "MATCH" as const,
    evidence: `Candidate evidence supports ${skill.name}`,
    candidateEvidence,
  };
}

interface ScoreState {
  coveredWeight: number;
  earnedWeight: number;
  certaintyWeight: number;
  totalWeight: number;
}

function emptyScoreState(): ScoreState {
  return {
    coveredWeight: 0,
    earnedWeight: 0,
    certaintyWeight: 0,
    totalWeight: 0,
  };
}

function assessmentValue(assessment: MatchAssessment) {
  if (assessment === "MATCH" || assessment === "SUPPORTED") return 1;
  if (assessment === "PARTIAL_MATCH" || assessment === "PARTIAL") return 0.5;
  return 0;
}

function assessmentCertainty(assessment: MatchAssessment) {
  return assessment === "PARTIAL_MATCH" || assessment === "PARTIAL" ? 0.75 : 1;
}

function roundedRatio(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) / 100 : 0;
}

function dimensionScore(state: ScoreState) {
  const coverage = roundedRatio(state.coveredWeight, state.totalWeight);
  if (state.coveredWeight === 0 || coverage < MINIMUM_SCORE_EVIDENCE_COVERAGE)
    return null;
  return Math.round((state.earnedWeight / state.coveredWeight) * 100);
}

export function matchCandidateToJob(
  candidate: CandidateMatchSnapshot,
  job: JobMatchSnapshot,
): JobMatchResult {
  const strengths: MatchEvidence[] = [];
  const partialMatches: MatchEvidence[] = [];
  const gaps: MatchEvidence[] = [];
  const conflicts: MatchEvidence[] = [];
  const hardConflicts: MatchEvidence[] = [];
  const unknowns: MatchEvidence[] = [];
  const qualification = emptyScoreState();
  const preference = emptyScoreState();

  function record(input: MatchEvidence) {
    const state =
      input.category === "QUALIFICATION" ? qualification : preference;
    const weight = input.weight ?? 1;
    state.totalWeight += weight;
    if (input.assessment !== "UNKNOWN") {
      state.coveredWeight += weight;
      state.earnedWeight += assessmentValue(input.assessment!) * weight;
      state.certaintyWeight += assessmentCertainty(input.assessment!) * weight;
    }
    if (input.assessment === "MATCH" || input.assessment === "SUPPORTED")
      strengths.push(input);
    else if (
      input.assessment === "PARTIAL_MATCH" ||
      input.assessment === "PARTIAL"
    )
      partialMatches.push(input);
    else if (input.assessment === "GAP") gaps.push(input);
    else if (input.assessment === "CONFLICT") {
      conflicts.push(input);
      if (input.hardConflict) hardConflicts.push(input);
    } else unknowns.push(input);
  }

  const requiredNames = new Set(
    (job.requiredSkills ?? []).map((skill) => normalizeSkillName(skill.name)),
  );
  const contradictory = (job.excludedSkills ?? []).find((skill) =>
    requiredNames.has(normalizeSkillName(skill)),
  );
  if (contradictory) {
    record({
      assessment: "UNKNOWN",
      candidateEvidence: [],
      category: "QUALIFICATION",
      code: "CONTRADICTORY_JOB_REQUIREMENTS",
      criterionId: "job.requirements.contradiction",
      evidence: "The source both requires and excludes the same skill",
      jobEvidence: jobReference("requirements", contradictory),
      label: "Contradictory job requirements",
      weight: WEIGHT.HARD_REQUIREMENT,
    });
  }

  if (job.authorizationCountries?.length) {
    const reference = jobReference("workAuthorization.countries");
    if (
      candidate.requiresSponsorship === true &&
      job.sponsorshipAvailable === false
    ) {
      record({
        assessment: "CONFLICT",
        candidateEvidence: [
          candidateReference("workAuthorization.requiresSponsorship"),
        ],
        category: "QUALIFICATION",
        code: "SPONSORSHIP_CONFLICT",
        criterionId: "qualification.authorization",
        evidence:
          "Candidate requires sponsorship and the job explicitly does not offer it",
        hardConflict: true,
        jobEvidence: reference,
        label: "Required sponsorship is unavailable",
        weight: WEIGHT.HARD_REQUIREMENT,
      });
    } else if (candidate.authorizationCountries === null) {
      record({
        assessment: "UNKNOWN",
        candidateEvidence: [],
        category: "QUALIFICATION",
        code: "AUTHORIZATION_UNKNOWN",
        criterionId: "qualification.authorization",
        evidence: "Candidate authorization evidence is not recorded",
        jobEvidence: reference,
        label: "Work authorization cannot be confirmed",
        weight: WEIGHT.HARD_REQUIREMENT,
      });
    } else if (
      job.authorizationCountries.some((country) =>
        includesNormalized(candidate.authorizationCountries, country),
      )
    ) {
      record({
        assessment: "MATCH",
        candidateEvidence: [
          candidateReference("workAuthorization.countryCode"),
        ],
        category: "QUALIFICATION",
        code: "WORK_AUTHORIZATION_MATCH",
        criterionId: "qualification.authorization",
        evidence: "Recorded authorization covers a stated job country",
        jobEvidence: reference,
        label: "Work authorization",
        weight: WEIGHT.HARD_REQUIREMENT,
      });
    } else if (
      candidate.requiresSponsorship === true &&
      job.sponsorshipAvailable === null
    ) {
      record({
        assessment: "UNKNOWN",
        candidateEvidence: [
          candidateReference("workAuthorization.countryCode"),
          candidateReference("workAuthorization.requiresSponsorship"),
        ],
        category: "QUALIFICATION",
        code: "SPONSORSHIP_UNKNOWN",
        criterionId: "qualification.authorization",
        evidence: "The source does not state whether sponsorship is available",
        jobEvidence: reference,
        label: "Sponsorship availability is unknown",
        weight: WEIGHT.HARD_REQUIREMENT,
      });
    } else {
      const sponsorshipPossible =
        candidate.requiresSponsorship === true &&
        job.sponsorshipAvailable === true;
      record({
        assessment: sponsorshipPossible ? "MATCH" : "CONFLICT",
        candidateEvidence: [
          candidateReference("workAuthorization.countryCode"),
          candidateReference("workAuthorization.requiresSponsorship"),
        ],
        category: "QUALIFICATION",
        code: sponsorshipPossible
          ? "SPONSORSHIP_AVAILABLE"
          : "WORK_AUTHORIZATION_CONFLICT",
        criterionId: "qualification.authorization",
        evidence: sponsorshipPossible
          ? "Candidate needs sponsorship and the job explicitly offers it"
          : "Recorded authorization does not cover the stated job countries",
        hardConflict: !sponsorshipPossible,
        jobEvidence: reference,
        label: sponsorshipPossible
          ? "Sponsorship is available"
          : "Work authorization conflicts with the role",
        weight: WEIGHT.HARD_REQUIREMENT,
      });
    }
  } else if (candidate.requiresSponsorship === true) {
    const stated = job.sponsorshipAvailable;
    record({
      assessment:
        stated === true ? "MATCH" : stated === false ? "CONFLICT" : "UNKNOWN",
      candidateEvidence: [
        candidateReference("workAuthorization.requiresSponsorship"),
      ],
      category: "QUALIFICATION",
      code:
        stated === true
          ? "SPONSORSHIP_AVAILABLE"
          : stated === false
            ? "SPONSORSHIP_CONFLICT"
            : "SPONSORSHIP_UNKNOWN",
      criterionId: "qualification.sponsorship",
      evidence:
        stated === true
          ? "The job explicitly offers required sponsorship"
          : stated === false
            ? "Candidate requires sponsorship and the job explicitly does not offer it"
            : "The source does not state whether sponsorship is available",
      hardConflict: stated === false,
      jobEvidence: jobReference("sponsorship.available"),
      label:
        stated === true
          ? "Sponsorship is available"
          : stated === false
            ? "Required sponsorship is unavailable"
            : "Sponsorship availability is unknown",
      weight: WEIGHT.HARD_REQUIREMENT,
    });
  }

  for (const [code, required, held, label, field] of [
    [
      "CLEARANCE",
      job.requiredClearance ? [job.requiredClearance] : null,
      candidate.clearances,
      "clearance",
      "workAuthorization.requiredClearance",
    ],
    [
      "LANGUAGE",
      job.requiredLanguages,
      candidate.languages,
      "language",
      "requiredLanguages",
    ],
    [
      "LICENSE",
      job.requiredLicenses,
      candidate.licenses,
      "license",
      "requiredLicenses",
    ],
  ] as const) {
    if (!required?.length) continue;
    const missing =
      held === null
        ? []
        : required.filter((value) => !includesNormalized(held, value));
    record({
      assessment: held === null ? "UNKNOWN" : missing.length ? "GAP" : "MATCH",
      candidateEvidence:
        held === null ? [] : [candidateReference(`${code.toLowerCase()}s`)],
      category: "QUALIFICATION",
      code:
        held === null
          ? `${code}_UNKNOWN`
          : missing.length
            ? `${code}_GAP`
            : `${code}_MATCH`,
      criterionId: `qualification.${code.toLowerCase()}`,
      evidence:
        held === null
          ? `Candidate ${label} evidence is not recorded`
          : missing.length
            ? `Recorded candidate evidence does not satisfy: ${missing.join(", ")}`
            : `Recorded candidate evidence satisfies: ${required.join(", ")}`,
      jobEvidence: jobReference(field),
      label: `Required ${label}`,
      weight: WEIGHT.HARD_REQUIREMENT,
    });
  }

  for (const [kind, requirements, weight] of [
    ["REQUIRED", job.requiredSkills, WEIGHT.HARD_REQUIREMENT],
    ["PREFERRED", job.preferredSkills, WEIGHT.PREFERRED_QUALIFICATION],
  ] as const) {
    for (const requirement of requirements ?? []) {
      const result = skillResult(requirement, candidate.skills);
      const normalizedName = normalizeSkillName(requirement.name);
      record({
        assessment: result.assessment,
        candidateEvidence: result.candidateEvidence,
        category: "QUALIFICATION",
        code: `${kind}_SKILL_${normalizedName}`,
        criterionId: `qualification.${kind.toLowerCase()}Skill.${normalizedName}`,
        evidence: result.evidence,
        jobEvidence:
          requirement.evidence ??
          jobReference(
            kind === "REQUIRED" ? "requirements" : "preferredRequirements",
            requirement.statement ?? requirement.name,
          ),
        label: `${kind === "REQUIRED" ? "Required" : "Preferred"} skill: ${requirement.name}`,
        weight,
      });
    }
  }

  for (const criterion of job.otherRequiredCriteria ?? []) {
    record({
      assessment: "UNKNOWN",
      candidateEvidence: [],
      category: "QUALIFICATION",
      code: criterion.code,
      criterionId: `qualification.otherRequired.${criterion.code}`,
      evidence:
        "No safe structured candidate comparison is available for this explicit requirement",
      jobEvidence: criterion.evidence,
      label: criterion.label,
      weight: criterion.weight ?? WEIGHT.HARD_REQUIREMENT,
    });
  }
  for (const criterion of job.otherPreferredCriteria ?? []) {
    record({
      assessment: "UNKNOWN",
      candidateEvidence: [],
      category: "QUALIFICATION",
      code: criterion.code,
      criterionId: `qualification.otherPreferred.${criterion.code}`,
      evidence:
        "No safe structured candidate comparison is available for this explicit preference",
      jobEvidence: criterion.evidence,
      label: criterion.label,
      weight: criterion.weight ?? WEIGHT.PREFERRED_QUALIFICATION,
    });
  }

  for (const [code, requirement, candidateValue, weight, field] of [
    [
      "EXPERIENCE",
      job.minimumExperienceMonths,
      candidate.experienceMonths,
      WEIGHT.HARD_REQUIREMENT,
      "experienceRequirements",
    ],
    [
      "SENIORITY",
      job.seniority,
      candidate.seniority,
      WEIGHT.REQUIREMENT,
      "seniority",
    ],
    [
      "ROLE_FAMILY",
      job.roleFamily,
      candidate.roleFamilies,
      WEIGHT.REQUIREMENT,
      "roleFamily",
    ],
    [
      "EDUCATION",
      job.educationLevels,
      candidate.educationLevels,
      WEIGHT.REQUIREMENT,
      "educationRequirements",
    ],
  ] as const) {
    if (requirement === null) continue;
    let matches = false;
    if (candidateValue !== null) {
      if (code === "EXPERIENCE")
        matches = (candidateValue as number) >= (requirement as number);
      else if (Array.isArray(requirement))
        matches = requirement.some((value) =>
          includesNormalized(candidateValue as readonly string[], value),
        );
      else if (Array.isArray(candidateValue))
        matches = includesNormalized(candidateValue, requirement as string);
      else
        matches =
          norm(candidateValue as string) === norm(requirement as string);
    }
    record({
      assessment:
        candidateValue === null ? "UNKNOWN" : matches ? "MATCH" : "GAP",
      candidateEvidence:
        candidateValue === null ? [] : [candidateReference(code.toLowerCase())],
      category: "QUALIFICATION",
      code:
        candidateValue === null
          ? `${code}_UNKNOWN`
          : matches
            ? `${code}_MATCH`
            : `${code}_GAP`,
      criterionId: `qualification.${code.toLowerCase()}`,
      evidence:
        candidateValue === null
          ? "Candidate evidence is not recorded"
          : matches
            ? "Recorded candidate evidence satisfies the stated criterion"
            : "Recorded candidate evidence affirmatively falls short of the stated criterion",
      jobEvidence: jobReference(field, String(requirement)),
      label: code.toLowerCase().replaceAll("_", " "),
      weight,
    });
  }

  function preferenceCriterion(input: {
    candidateField: string;
    code: string;
    jobField: string;
    jobValues: readonly string[] | string | null;
    label: string;
    preferred: readonly string[] | null | undefined;
    weight?: number;
  }) {
    const hasJobEvidence = Array.isArray(input.jobValues)
      ? input.jobValues.length > 0
      : Boolean(input.jobValues);
    const hasCandidatePreference = Boolean(input.preferred?.length);
    if (!hasJobEvidence && !hasCandidatePreference) return;
    const jobValues = Array.isArray(input.jobValues)
      ? input.jobValues
      : input.jobValues
        ? [input.jobValues]
        : [];
    const matches =
      hasJobEvidence &&
      hasCandidatePreference &&
      jobValues.some((value) => includesNormalized(input.preferred!, value));
    const assessment =
      !hasJobEvidence || input.preferred == null
        ? "UNKNOWN"
        : matches
          ? "MATCH"
          : "CONFLICT";
    record({
      assessment,
      candidateEvidence: hasCandidatePreference
        ? [candidateReference(input.candidateField, "CANDIDATE_PREFERENCE")]
        : [],
      category: "PREFERENCE",
      code: `${input.code}_${assessment}`,
      criterionId: `preference.${input.code.toLowerCase()}`,
      evidence: !hasJobEvidence
        ? "The source does not state this job attribute"
        : input.preferred == null
          ? "No candidate preference is recorded"
          : matches
            ? "The stated job attribute aligns with the candidate preference"
            : "The stated job attribute conflicts with the candidate preference",
      jobEvidence: jobReference(input.jobField),
      label: input.label,
      weight: input.weight ?? WEIGHT.PREFERENCE,
    });
  }

  preferenceCriterion({
    candidateField: "preferences.roleFamilies",
    code: "ROLE_PREFERENCE",
    jobField: "roleFamily",
    jobValues: job.roleFamily,
    label: "Role-family preference",
    preferred: candidate.preferredRoleFamilies,
  });
  preferenceCriterion({
    candidateField: "preferences.remotePreference",
    code: "REMOTE_PREFERENCE",
    jobField: "remoteType",
    jobValues: job.remoteType,
    label: "Work-mode preference",
    preferred: candidate.preferredRemoteTypes,
    weight: WEIGHT.HARD_PREFERENCE,
  });
  preferenceCriterion({
    candidateField: "preferences.industries",
    code: "INDUSTRY_PREFERENCE",
    jobField: "industry",
    jobValues: job.industry,
    label: "Industry preference",
    preferred: candidate.preferredIndustries,
  });
  preferenceCriterion({
    candidateField: "preferences.locations",
    code: "LOCATION_PREFERENCE",
    jobField: "locations",
    jobValues: job.locations,
    label: "Location preference",
    preferred: candidate.preferredLocations,
  });
  preferenceCriterion({
    candidateField: "preferences.employmentTypes",
    code: "EMPLOYMENT_TYPE_PREFERENCE",
    jobField: "employmentType",
    jobValues: job.employmentType ?? null,
    label: "Employment-type preference",
    preferred: candidate.preferredEmploymentTypes,
  });
  preferenceCriterion({
    candidateField: "preferences.seniorities",
    code: "SENIORITY_PREFERENCE",
    jobField: "seniority",
    jobValues: job.seniority,
    label: "Seniority preference",
    preferred: candidate.preferredSeniorities,
  });

  if (candidate.requiredSalaryMinimum != null) {
    const assessment =
      job.maximumSalary == null
        ? "UNKNOWN"
        : job.maximumSalary < candidate.requiredSalaryMinimum
          ? "CONFLICT"
          : "MATCH";
    record({
      assessment,
      candidateEvidence: [
        candidateReference("preferences.salaryMinimum", "CANDIDATE_PREFERENCE"),
      ],
      category: "PREFERENCE",
      code: `COMPENSATION_${assessment}`,
      criterionId: "preference.compensation",
      evidence:
        job.maximumSalary == null
          ? "The source does not state maximum compensation"
          : assessment === "MATCH"
            ? "Published maximum compensation meets the candidate hard floor"
            : "Published maximum compensation is below the candidate hard floor",
      hardConflict: assessment === "CONFLICT",
      jobEvidence: jobReference("salaryMax"),
      label: "Compensation policy",
      weight: WEIGHT.HARD_PREFERENCE,
    });
  }

  if (job.locations?.length && candidate.locationExclusions?.length) {
    const excluded = job.locations.every((location) =>
      includesNormalized(candidate.locationExclusions, location),
    );
    if (excluded) {
      record({
        assessment: "CONFLICT",
        candidateEvidence: [
          candidateReference(
            "preferences.locationExclusions",
            "CANDIDATE_PREFERENCE",
          ),
        ],
        category: "PREFERENCE",
        code: "LOCATION_POLICY_CONFLICT",
        criterionId: "preference.locationPolicy",
        evidence: "Every stated job location is explicitly excluded",
        hardConflict: true,
        jobEvidence: jobReference("locations"),
        label: "Location policy conflict",
        weight: WEIGHT.HARD_PREFERENCE,
      });
    }
  }

  const totalWeight = qualification.totalWeight + preference.totalWeight;
  const coveredWeight = qualification.coveredWeight + preference.coveredWeight;
  const evidenceCoverage = roundedRatio(coveredWeight, totalWeight);
  const confidence = roundedRatio(
    qualification.certaintyWeight + preference.certaintyWeight,
    coveredWeight,
  );
  const qualificationScore = dimensionScore(qualification);
  const preferenceScore = dimensionScore(preference);
  let overallFit: number | null = null;
  if (
    evidenceCoverage >= MINIMUM_SCORE_EVIDENCE_COVERAGE &&
    qualificationScore != null
  ) {
    overallFit =
      preferenceScore == null
        ? qualificationScore
        : Math.round(qualificationScore * 0.75 + preferenceScore * 0.25);
    if (hardConflicts.length) overallFit = Math.min(overallFit, 20);
  }

  return {
    qualificationScore,
    preferenceScore,
    overallFit,
    conflicts,
    hardConflicts,
    strengths,
    partialMatches,
    gaps,
    unknowns,
    confidence,
    evidenceCoverage,
    scoringVersion: MATCH_SCORING_VERSION,
  };
}
