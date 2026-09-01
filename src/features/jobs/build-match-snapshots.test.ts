import { describe, expect, it } from "vitest";
import {
  buildCandidateMatchSnapshot,
  buildJobMatchSnapshot,
} from "./build-match-snapshots";

describe("match snapshot evidence boundaries", () => {
  it("does not treat role preferences as qualification history", () => {
    const snapshot = buildCandidateMatchSnapshot(
      {
        skills: [],
        workExperiences: [],
        educationRecords: [],
        preferences: {
          roleFamilies: ["Product"],
          industries: ["Fintech"],
          remotePreference: "REMOTE",
          locationPreferences: ["New York"],
          salaryMinimum: 120000,
        },
        authorization: {
          countryCode: "US",
          authorizationStatus: "Not authorized",
          requiresSponsorship: true,
        },
      },
      new Date("2026-08-13"),
    );
    expect(snapshot.roleFamilies).toBeNull();
    expect(snapshot.preferredRoleFamilies).toEqual(["Product"]);
    expect(snapshot.authorizationCountries).toEqual([]);
    expect(snapshot.requiresSponsorship).toBe(true);
  });

  it("treats unclassified job skills as preferred, not mandatory", () => {
    const snapshot = buildJobMatchSnapshot({
      requirements: null,
      preferredRequirements: null,
      skills: ["TypeScript"],
      educationRequirements: null,
      experienceRequirements: null,
      workAuthorization: null,
      sponsorship: null,
      locations: null,
      remoteType: null,
      salaryMax: null,
      seniority: null,
    });
    expect(snapshot.requiredSkills).toBeNull();
    expect(snapshot.preferredSkills).toEqual([
      {
        evidence: {
          field: "skills",
          origin: "SOURCE_STRUCTURED_FIELD",
          statement: "TypeScript",
        },
        name: "TypeScript",
        minimumExperienceMonths: null,
        minimumProficiency: null,
      },
    ]);
  });

  it("uses only exact structured project and verified résumé skill facts", () => {
    const snapshot = buildCandidateMatchSnapshot({
      authorization: null,
      candidateFacts: [
        { factType: "SKILL_TEXT", value: { text: "Python" } },
        { factType: "EDUCATION_TEXT", value: { text: "Rust" } },
      ],
      educationRecords: [],
      preferences: null,
      projects: [{ skills: ["TypeScript"] }],
      skills: [],
      workExperiences: [],
    });

    expect(snapshot.skills).toEqual([
      {
        evidenceCount: 0,
        experienceMonths: null,
        name: "TypeScript",
        proficiency: null,
      },
      {
        evidenceCount: 1,
        experienceMonths: null,
        name: "Python",
        proficiency: null,
      },
    ]);
  });
});
