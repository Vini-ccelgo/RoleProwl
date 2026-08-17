import type { PersonalJobResult, PersonalProwlResult } from "./personal-prowl";

export function personalJobFixture(
  overrides: Partial<PersonalJobResult> = {},
): PersonalJobResult {
  return {
    id: "0123456789abcdef",
    rank: 1,
    fitScore: 82,
    deterministicFitScore: 82,
    confidence: 0.8,
    title: "Security Analyst",
    company: "Example Corp",
    description: "Required: Linux and SIEM operations.",
    location: "Remote",
    remoteStatus: "REMOTE",
    employmentType: "FULL_TIME",
    postedAt: "2026-08-16T00:00:00.000Z",
    freshness: "CURRENT",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryInterval: null,
    applicationUrl: "https://jobs.example.com/security-analyst",
    sources: [
      {
        source: "GREENHOUSE",
        label: "Greenhouse/Example Corp",
        sourceJobId: "101",
        sourceUrl: "https://jobs.example.com/security-analyst",
      },
    ],
    strongMatches: [
      {
        code: "SKILL",
        label: "Required skill: Linux",
        evidence: "Exact evidence for Linux",
      },
    ],
    partialMatches: [],
    importantGaps: [],
    hardConflicts: [],
    unknowns: [],
    explanation: "Worth reviewing soon.",
    ...overrides,
  };
}

export function personalResultFixture(
  job = personalJobFixture(),
): PersonalProwlResult {
  return {
    generatedAt: "2026-08-17T00:00:00.000Z",
    mode: "DETERMINISTIC_LOCAL",
    searchQueries: ["Security Analyst"],
    stats: {
      sources: 1,
      jobsDiscovered: 1,
      jobsNormalized: 1,
      jobsDeduplicated: 1,
      jobsPassedHardFilters: 1,
      jobsFiltered: 0,
      jobsEvaluated: 1,
      jobsReturned: 1,
    },
    sources: [
      {
        key: "greenhouse:example",
        label: "Greenhouse/Example Corp",
        status: "OK",
        jobs: 1,
        message: null,
        attributionUrl: null,
      },
    ],
    sourceErrors: [],
    filteredJobs: [],
    jobs: [job],
  };
}
