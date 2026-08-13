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
    expect(snapshot.authorizationCountries).toBeNull();
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
        name: "TypeScript",
        minimumExperienceMonths: null,
        minimumProficiency: null,
      },
    ]);
  });
});
