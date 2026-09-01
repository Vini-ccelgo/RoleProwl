import { describe, expect, it } from "vitest";
import { answerMemoryStatus } from "@/core/domain/applications/answer-memory";
import { decideAnswerAuthority } from "@/core/domain/applications/answer-authority";
import { classifyQuestionDeterministically } from "@/core/domain/applications/question-classifier";
import { workExperienceSchema } from "@/core/domain/candidate/truth-vault";
import { classifyGeneratedClaim } from "@/core/domain/claims/provenance";
import { matchCandidateToJob } from "@/core/domain/matching/match-job";
import { PHASE_C_SAFETY_CASES } from "./phase-c-safety-cases";

describe("Phase C reusable safety evaluation", () => {
  it("contains every mandated adversarial case", () => {
    expect(PHASE_C_SAFETY_CASES).toHaveLength(12);
    expect(new Set(PHASE_C_SAFETY_CASES.map(({ id }) => id)).size).toBe(12);
  });

  it.each([
    ["fabricated-degree", "CREDENTIAL_NAME", "Invented University"],
    ["fabricated-certification", "CREDENTIAL_NAME", "Invented Certificate"],
  ] as const)("blocks %s", (_id, kind, value) => {
    expect(
      classifyGeneratedClaim({
        assertions: [{ kind, value }],
        evidence: [
          {
            evidenceType: "profile",
            evidenceId: "profile-1",
            evidenceField: "summary",
            snapshot: { summary: "Engineer" },
          },
        ],
        intendedClassification: "DIRECT_FACT",
      }),
    ).toBe("UNSUPPORTED");
  });

  it("does not infer ambiguous years or an unsupported skill", () => {
    expect(
      classifyGeneratedClaim({
        assertions: [{ kind: "DURATION_MONTHS", value: "60" }],
        evidence: [
          {
            evidenceType: "work",
            evidenceId: "work-1",
            evidenceField: "dates",
            snapshot: { startDate: "approximately 2020", endDate: "present" },
          },
        ],
        intendedClassification: "DIRECT_FACT",
      }),
    ).toBe("UNSUPPORTED");
    expect(
      classifyGeneratedClaim({
        assertions: [],
        evidence: [],
        intendedClassification: "SUPPORTED_REWRITE",
      }),
    ).toBe("UNSUPPORTED");
  });

  it("accepts a valid evidence-backed paraphrase", () => {
    expect(
      classifyGeneratedClaim({
        assertions: [{ kind: "EMPLOYER_NAME", value: "Acme" }],
        evidence: [
          {
            evidenceType: "work",
            evidenceId: "work-1",
            evidenceField: "employer",
            snapshot: { employer: "Acme" },
          },
        ],
        intendedClassification: "SUPPORTED_REWRITE",
      }),
    ).toBe("SUPPORTED_REWRITE");
  });

  it.each([
    ["What are your salary expectations?", "USER_POLICY"],
    ["Will you require visa sponsorship?", "LEGAL_OR_CONSEQUENTIAL"],
    ["What is your ethnicity?", "SENSITIVE_PERSONAL_DATA"],
    ["I certify that all statements are accurate.", "ATTESTATION"],
    ["Why are you interested in this role?", "JOB_SPECIFIC_FREE_TEXT"],
  ] as const)("classifies evaluation question %s", (question, expected) => {
    expect(classifyQuestionDeterministically(question).classification).toBe(
      expected,
    );
  });

  it("requires review for demographics and legal attestation", () => {
    for (const classification of [
      "SENSITIVE_PERSONAL_DATA",
      "ATTESTATION",
    ] as const) {
      expect(decideAnswerAuthority({ classification }).disposition).toBe(
        "NEEDS_REVIEW",
      );
    }
  });

  it("requires fresh explicit sponsorship evidence", () => {
    const memoryStatus = answerMemoryStatus(
      {
        autoAnswerAllowed: true,
        concept: "US_FUTURE_SPONSORSHIP",
        reverifyAfterDays: 90,
        verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      new Date("2026-08-13T00:00:00.000Z"),
    );
    expect(
      decideAnswerAuthority({
        classification: "LEGAL_OR_CONSEQUENTIAL",
        answer: { source: "EXPLICIT_CONSEQUENTIAL", memoryStatus },
      }).disposition,
    ).toBe("NEEDS_REVIEW");
  });

  it("rejects conflicting resume dates", () => {
    expect(
      workExperienceSchema.safeParse({
        employer: "Acme",
        title: "Engineer",
        startDate: "2025-01-01",
        endDate: "2024-01-01",
        isCurrent: false,
        responsibilities: [],
        achievements: [],
      }).success,
    ).toBe(false);
  });

  it("surfaces misleading contradictory job requirements", () => {
    const result = matchCandidateToJob(
      {
        authorizationCountries: null,
        requiresSponsorship: null,
        clearances: null,
        languages: null,
        licenses: null,
        locationExclusions: null,
        requiredSalaryMinimum: null,
        skills: [{ name: "Java", proficiency: null, experienceMonths: null }],
        experienceMonths: null,
        roleFamilies: null,
        industries: null,
        educationLevels: null,
        seniority: null,
        preferredRoleFamilies: null,
        preferredRemoteTypes: null,
        preferredIndustries: null,
        preferredLocations: null,
      },
      {
        authorizationCountries: null,
        sponsorshipAvailable: null,
        requiredClearance: null,
        requiredLanguages: null,
        requiredLicenses: null,
        locations: null,
        maximumSalary: null,
        requiredSkills: [
          {
            name: "Java",
            minimumExperienceMonths: null,
            minimumProficiency: null,
          },
        ],
        preferredSkills: null,
        excludedSkills: ["Java"],
        minimumExperienceMonths: null,
        roleFamily: null,
        industry: null,
        educationLevels: null,
        seniority: null,
        remoteType: null,
      },
    );
    expect(result.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CONTRADICTORY_JOB_REQUIREMENTS" }),
      ]),
    );
    expect(result.hardConflicts).toHaveLength(0);
  });
});
