import type { CandidateMatchSnapshot } from "@/core/domain/matching/match-job";

export interface PersonalResumeExtraction {
  readonly sections: Readonly<Record<string, readonly string[]>>;
  readonly skills: readonly string[];
  readonly languages: readonly string[];
  readonly location: string | null;
  readonly authorizationCountries: readonly string[] | null;
  readonly requiresSponsorship: boolean | null;
}

export interface PersonalCandidatePreferences {
  readonly locations: readonly string[];
  readonly remotePreferred: boolean;
  readonly targetRoles: readonly string[];
  readonly minimumSalary: number | null;
}

export interface CanonicalPersonalEvidence {
  readonly id: string;
  readonly kind: "RESUME_SECTION" | "SKILL" | "LOCATION" | "WORK_AUTHORIZATION";
  readonly label: string;
  readonly quote: string;
}

export interface CanonicalPersonalCandidate {
  readonly version: 1;
  readonly evidence: readonly CanonicalPersonalEvidence[];
  readonly matchSnapshot: CandidateMatchSnapshot;
}

export function buildCanonicalPersonalCandidate(input: {
  readonly parsedResume: PersonalResumeExtraction;
  readonly preferences: PersonalCandidatePreferences;
}): CanonicalPersonalCandidate {
  const parsed = input.parsedResume;
  const evidence: CanonicalPersonalEvidence[] = [];
  const resumeLines = Object.values(parsed.sections).flat();
  for (const [section, lines] of Object.entries(parsed.sections))
    for (const [index, line] of lines.entries())
      evidence.push({
        id: `resume:${section}:${index + 1}`,
        kind:
          section === "location"
            ? "LOCATION"
            : section === "work authorization"
              ? "WORK_AUTHORIZATION"
              : "RESUME_SECTION",
        label: section,
        quote: line,
      });
  for (const [index, skill] of parsed.skills.entries()) {
    const normalizedSkill = skill.toLocaleLowerCase("en-US");
    const quote = resumeLines.find((line) =>
      line.toLocaleLowerCase("en-US").includes(normalizedSkill),
    );
    if (quote)
      evidence.push({
        id: `skill:${index + 1}`,
        kind: "SKILL",
        label: skill,
        quote,
      });
  }

  const matchSnapshot = {
    authorizationCountries: parsed.authorizationCountries,
    requiresSponsorship: parsed.requiresSponsorship,
    clearances: null,
    educationLevels: null,
    experienceMonths: null,
    industries: null,
    languages: parsed.languages.length ? parsed.languages : null,
    licenses: null,
    locationExclusions: null,
    preferredIndustries: null,
    preferredLocations: input.preferences.locations.length
      ? input.preferences.locations
      : null,
    preferredRemoteTypes: input.preferences.remotePreferred ? ["REMOTE"] : null,
    preferredRoleFamilies: input.preferences.targetRoles.length
      ? input.preferences.targetRoles
      : null,
    requiredSalaryMinimum: input.preferences.minimumSalary,
    roleFamilies: null,
    seniority: null,
    skills: parsed.skills.map((name) => ({
      name,
      proficiency: null,
      experienceMonths: null,
    })),
  } satisfies CandidateMatchSnapshot;

  return { version: 1, evidence, matchSnapshot };
}
