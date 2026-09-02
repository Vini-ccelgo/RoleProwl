import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { matchCandidateToJob } from "@/core/domain/matching/match-job";
import {
  buildCandidateMatchSnapshot,
  buildJobMatchSnapshot,
} from "@/features/jobs/build-match-snapshots";
import {
  ingestNormalizedJob,
  type JobIngestionRepository,
} from "@/features/jobs/ingest-normalized-job";
import { GreenhouseJobSource } from "./greenhouse-job-source";

describe("fresh Greenhouse grounded match pipeline", () => {
  it("preserves explicit HTML qualifications through ingestion and matching", async () => {
    const source = new GreenhouseJobSource({
      boardToken: "acme",
      company: "Acme",
    });
    const normalized = await source.normalize({
      applicationUrl: "https://boards.greenhouse.io/acme/jobs/101",
      externalId: "101",
      payload: {
        absolute_url: "https://boards.greenhouse.io/acme/jobs/101",
        content: [
          "<p>We use Go across the platform.</p>",
          "<p><strong>What We’re Looking For</strong><br>",
          "- 3+ years of Python<br>",
          "- Experience with network automation<br>",
          "- Bachelor’s degree or equivalent experience</p>",
          "<p><strong>Responsibilities</strong></p>",
          "<ul><li>Operate production services</li></ul>",
        ].join(""),
        id: 101,
        location: { name: "Remote - Brazil" },
        title: "Network Automation Engineer",
      },
      source: "GREENHOUSE",
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/101",
    });

    let persistedCanonical: typeof normalized.canonical | null = null;
    const repository: JobIngestionRepository = {
      findDeduplicationCandidates: async () => [],
      createCanonicalWithSource: async (input) => {
        persistedCanonical = input.normalized.canonical;
        return "job-101";
      },
      mergeSourceAssociation: async () => undefined,
    };
    await ingestNormalizedJob(normalized, repository);
    expect(persistedCanonical).not.toBeNull();
    const canonical = persistedCanonical!;
    expect(canonical.requirements).toHaveLength(3);

    const candidate = buildCandidateMatchSnapshot({
      authorization: null,
      candidateFacts: [{ factType: "SKILL_TEXT", value: { text: "Python" } }],
      educationRecords: [],
      preferences: null,
      projects: [],
      skills: [
        {
          canonicalName: "Python",
          evidenceCount: 1,
          experienceMonths: 48,
          proficiency: "WORKING",
        },
      ],
      workExperiences: [],
    });
    const job = buildJobMatchSnapshot({
      educationRequirements:
        canonical.educationRequirements as Prisma.JsonValue,
      employmentType: canonical.employmentType,
      experienceRequirements:
        canonical.experienceRequirements as Prisma.JsonValue,
      locations: canonical.locations as Prisma.JsonValue,
      preferredRequirements:
        canonical.preferredRequirements as Prisma.JsonValue,
      remoteType: canonical.remoteType,
      requirements: canonical.requirements as Prisma.JsonValue,
      salaryMax: null,
      seniority: canonical.seniority,
      skills: canonical.skills as Prisma.JsonValue,
      sponsorship: canonical.sponsorship as Prisma.JsonValue,
      workAuthorization: canonical.workAuthorization as Prisma.JsonValue,
    });
    const persistedAnalysis = {
      jobId: "job-101",
      userId: "candidate-1",
      ...matchCandidateToJob(candidate, job),
    };

    expect(persistedAnalysis.strengths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "MATCH",
          code: "REQUIRED_SKILL_python",
        }),
      ]),
    );
    expect(persistedAnalysis.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "UNKNOWN",
          jobEvidence: expect.objectContaining({
            statement: "Experience with network automation",
          }),
        }),
        expect.objectContaining({
          assessment: "UNKNOWN",
          label: "Bachelor’s degree or equivalent experience",
        }),
      ]),
    );
    expect(persistedAnalysis.evidenceCoverage).toBeGreaterThan(0);
    expect(persistedAnalysis.evidenceCoverage).toBeLessThan(0.5);
    expect(persistedAnalysis.confidence).toBe(1);
    expect(persistedAnalysis.qualificationScore).toBeNull();
    expect(persistedAnalysis.overallFit).toBeNull();
    expect(persistedAnalysis.scoringVersion).toBe("match-v1.2");
  });

  it("uses an exact accepted résumé skill fact for an explicit comparable requirement", async () => {
    const source = new GreenhouseJobSource({
      boardToken: "acme",
      company: "Acme",
    });
    const normalized = await source.normalize({
      applicationUrl: "https://boards.greenhouse.io/acme/jobs/102",
      externalId: "102",
      payload: {
        content:
          "<h2>Required Qualifications</h2><ul><li>Experience with Python required</li></ul>",
        id: 102,
        title: "Python Engineer",
      },
      source: "GREENHOUSE",
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/102",
    });
    const candidate = buildCandidateMatchSnapshot({
      authorization: null,
      candidateFacts: [{ factType: "SKILL_TEXT", value: { text: "Python" } }],
      educationRecords: [],
      preferences: null,
      projects: [],
      skills: [],
      workExperiences: [],
    });
    const job = buildJobMatchSnapshot({
      educationRequirements: null,
      experienceRequirements: null,
      locations: null,
      preferredRequirements: null,
      remoteType: null,
      requirements: normalized.canonical.requirements as Prisma.JsonValue,
      salaryMax: null,
      seniority: null,
      skills: null,
      sponsorship: null,
      workAuthorization: null,
    });

    expect(matchCandidateToJob(candidate, job).strengths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "MATCH",
          code: "REQUIRED_SKILL_python",
          candidateEvidence: [
            expect.objectContaining({ origin: "CANDIDATE_VERIFIED_FACT" }),
          ],
        }),
      ]),
    );
  });
});
