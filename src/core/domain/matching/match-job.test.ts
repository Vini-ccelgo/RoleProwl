import { describe, expect, it } from "vitest";
import {
  matchCandidateToJob,
  type CandidateMatchSnapshot,
  type JobMatchSnapshot,
} from "./match-job";

const candidate: CandidateMatchSnapshot = {
  authorizationCountries: ["US"],
  requiresSponsorship: false,
  clearances: [],
  languages: ["English"],
  licenses: [],
  locationExclusions: [],
  requiredSalaryMinimum: 100000,
  skills: [
    { name: "Java", proficiency: "ADVANCED", experienceMonths: 48 },
    { name: "React", proficiency: "WORKING", experienceMonths: 24 },
    { name: "SQL", proficiency: "ADVANCED", experienceMonths: 36 },
    { name: "C", proficiency: "WORKING", experienceMonths: 12 },
  ],
  experienceMonths: 60,
  roleFamilies: ["Software Engineering"],
  industries: ["SaaS"],
  educationLevels: ["BACHELORS"],
  seniority: "MID",
  preferredRoleFamilies: ["Software Engineering"],
  preferredRemoteTypes: ["REMOTE"],
  preferredIndustries: ["SaaS"],
  preferredLocations: ["Remote"],
};

const job: JobMatchSnapshot = {
  authorizationCountries: ["US"],
  sponsorshipAvailable: false,
  requiredClearance: null,
  requiredLanguages: ["English"],
  requiredLicenses: null,
  locations: ["Remote"],
  maximumSalary: 150000,
  requiredSkills: [
    {
      name: "Java",
      minimumExperienceMonths: 36,
      minimumProficiency: "WORKING",
    },
    { name: "SQL", minimumExperienceMonths: null, minimumProficiency: null },
  ],
  preferredSkills: [
    { name: "React", minimumExperienceMonths: null, minimumProficiency: null },
  ],
  excludedSkills: [],
  minimumExperienceMonths: 48,
  roleFamily: "Software Engineering",
  industry: "SaaS",
  educationLevels: ["BACHELORS"],
  seniority: "MID",
  remoteType: "REMOTE",
};

describe("matching engine v1", () => {
  it("scores a highly suitable role with evidence", () => {
    const result = matchCandidateToJob(candidate, job);
    expect(result.qualificationScore).toBeGreaterThanOrEqual(90);
    expect(result.preferenceScore).toBe(100);
    expect(result.hardConflicts).toHaveLength(0);
    expect(result.strengths.length).toBeGreaterThan(3);
  });

  it("identifies a clearly unsuitable role", () => {
    const result = matchCandidateToJob(candidate, {
      ...job,
      requiredSkills: [
        {
          name: "Rust",
          minimumExperienceMonths: 60,
          minimumProficiency: "EXPERT",
        },
        {
          name: "Kubernetes",
          minimumExperienceMonths: 36,
          minimumProficiency: "ADVANCED",
        },
      ],
      roleFamily: "Site Reliability",
      seniority: "SENIOR",
    });
    expect(result.qualificationScore).toBeLessThan(50);
    expect(result.gaps.length).toBeGreaterThanOrEqual(3);
  });

  it("caps overall fit on a hard sponsorship conflict", () => {
    const result = matchCandidateToJob(
      {
        ...candidate,
        authorizationCountries: ["CA"],
        requiresSponsorship: true,
      },
      job,
    );
    expect(result.hardConflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SPONSORSHIP_CONFLICT" }),
      ]),
    );
    expect(result.overallFit).toBeLessThanOrEqual(20);
  });

  it("preserves unknown requirements and lowers confidence", () => {
    const result = matchCandidateToJob(
      { ...candidate, authorizationCountries: null, licenses: null },
      { ...job, requiredLicenses: ["PE"] },
    );
    expect(result.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "AUTHORIZATION_UNKNOWN" }),
        expect.objectContaining({ code: "LICENSE_UNKNOWN" }),
      ]),
    );
    expect(result.confidence).toBeLessThan(1);
  });

  it.each([
    ["Java", "JavaScript"],
    ["C", "C++"],
    ["React", "React Native"],
    ["SQL", "PostgreSQL"],
  ])("does not treat %s as %s", (held, required) => {
    const result = matchCandidateToJob(
      {
        ...candidate,
        skills: [{ name: held, proficiency: "EXPERT", experienceMonths: 120 }],
      },
      {
        ...job,
        requiredSkills: [
          {
            name: required,
            minimumExperienceMonths: null,
            minimumProficiency: null,
          },
        ],
      },
    );
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: `Required skill: ${required}` }),
      ]),
    );
  });

  it("does not infer years or expert proficiency from skill presence", () => {
    const result = matchCandidateToJob(
      {
        ...candidate,
        skills: [
          { name: "Java", proficiency: "FAMILIAR", experienceMonths: null },
        ],
      },
      {
        ...job,
        requiredSkills: [
          {
            name: "Java",
            minimumExperienceMonths: 60,
            minimumProficiency: "EXPERT",
          },
        ],
      },
    );
    expect(result.partialMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidence: "familiar is below expert" }),
      ]),
    );
  });

  it("flags contradictory job requirements", () => {
    const result = matchCandidateToJob(candidate, {
      ...job,
      excludedSkills: ["Java"],
    });
    expect(result.hardConflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CONTRADICTORY_JOB_REQUIREMENTS" }),
      ]),
    );
  });

  it("handles a sparse job without inventing a high-confidence score", () => {
    const sparse = Object.fromEntries(
      Object.keys(job).map((key) => [
        key,
        key === "requiredSkills" || key === "preferredSkills" ? null : null,
      ]),
    ) as unknown as JobMatchSnapshot;
    const result = matchCandidateToJob(candidate, sparse);
    expect(result.confidence).toBe(0);
    expect(result.preferenceScore).toBe(50);
  });
});
