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

  it("keeps OR and example skills contextual while preserving one unresolved source criterion", () => {
    const statement =
      "Experience using frameworks such as PyTorch, LightGBM, or ONNX.";
    const snapshot = buildJobMatchSnapshot({
      requirements: [
        {
          evaluationMode: "CONTEXT_ONLY",
          kind: "SKILL",
          logicalContext: "EXAMPLE",
          origin: "SOURCE_TEXT_EXPLICIT",
          skillName: "PyTorch",
          sourceField: "description.requirements",
          statement,
        },
        {
          evaluationMode: "CONTEXT_ONLY",
          kind: "SKILL",
          logicalContext: "EXAMPLE",
          origin: "SOURCE_TEXT_EXPLICIT",
          skillName: "LightGBM",
          sourceField: "description.requirements",
          statement,
        },
        {
          evaluationMode: "CONTEXT_ONLY",
          kind: "SKILL",
          logicalContext: "EXAMPLE",
          origin: "SOURCE_TEXT_EXPLICIT",
          skillName: "ONNX",
          sourceField: "description.requirements",
          statement,
        },
        {
          kind: "OTHER",
          logicalContext: "EXAMPLE",
          origin: "SOURCE_TEXT_EXPLICIT",
          sourceField: "description.requirements",
          statement,
        },
      ],
      preferredRequirements: null,
      skills: null,
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
    expect(snapshot.otherRequiredCriteria).toEqual([
      expect.objectContaining({
        evidence: expect.objectContaining({ statement }),
        label: statement,
      }),
    ]);
  });

  it("uses only structured project skills and canonical verified skill evidence", () => {
    const snapshot = buildCandidateMatchSnapshot({
      authorization: null,
      educationRecords: [],
      preferences: null,
      projects: [{ skills: ["TypeScript"] }],
      skills: [
        {
          canonicalName: "Python",
          evidence: [
            {
              evidenceId: "fact-python",
              evidenceType: "CANDIDATE_FACT",
              id: "evidence-python",
              source: "RESUME_EXTRACTED",
            },
          ],
          experienceMonths: null,
          proficiency: null,
        },
      ],
      workExperiences: [],
    });

    expect(snapshot.skills).toEqual([
      {
        evidence: [
          {
            evidenceId: "fact-python",
            evidenceType: "CANDIDATE_FACT",
            field: "candidateFacts.fact-python",
            origin: "CANDIDATE_VERIFIED_FACT",
            source: "RESUME_EXTRACTED",
          },
        ],
        evidenceCount: 1,
        experienceMonths: null,
        name: "Python",
        proficiency: null,
      },
      {
        evidenceCount: 0,
        experienceMonths: null,
        name: "TypeScript",
        proficiency: null,
      },
    ]);
  });
});
