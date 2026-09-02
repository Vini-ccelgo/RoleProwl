import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import {
  canonicalJobContentHash,
  type CanonicalJobInput,
} from "@/core/domain/jobs/job";
import { JOB_EVIDENCE_VERSION } from "@/core/domain/jobs/job-evidence";
import { matchCandidateToJob } from "@/core/domain/matching/match-job";
import {
  buildCandidateMatchSnapshot,
  buildJobMatchSnapshot,
} from "./build-match-snapshots";
import { currentMatchAnalysisWhere } from "./match-query-policy";
import {
  refreshJobEvidence,
  type CanonicalJobRefreshTarget,
  type JobEvidenceRefreshRepository,
} from "./refresh-job-evidence";
import { GreenhouseJobSource } from "@/integrations/jobs/greenhouse-job-source";

const sourcePayload = {
  absolute_url: "https://boards.greenhouse.io/acme/jobs/101",
  content: [
    "<p>We use Go across the platform.</p>",
    "<h2>Required Qualifications</h2>",
    "<ul><li>3+ years of Python</li>",
    "<li>Experience with network automation</li></ul>",
  ].join(""),
  id: 101,
  location: { name: "Remote - Brazil" },
  title: "Network Automation Engineer",
};

describe("versioned persisted job evidence refresh", () => {
  it("reprocesses unchanged Greenhouse HTML, invalidates the stale analysis, and avoids repeated invalidation", async () => {
    const oldCanonical = {
      canonicalApplicationUrl: sourcePayload.absolute_url,
      company: "Acme",
      description:
        "We use Go across the platform.\nRequired Qualifications\n• 3+ years of Python\n• Experience with network automation",
      educationRequirements: null,
      employmentType: null,
      experienceRequirements: null,
      expiresAt: null,
      locations: ["Remote - Brazil"],
      postedAt: null,
      preferredRequirements: null,
      remoteType: "REMOTE" as const,
      requirements: null,
      salaryCurrency: null,
      salaryInterval: null,
      salaryMax: null,
      salaryMin: null,
      seniority: null,
      skills: null,
      sponsorship: null,
      title: sourcePayload.title,
      workAuthorization: null,
    } satisfies CanonicalJobInput;
    const state: {
      analysis: { evidenceCoverage: number; scoringVersion: string } | null;
      canonical: CanonicalJobInput;
      evidenceVersion: string | null;
      invalidations: number;
    } = {
      analysis: { evidenceCoverage: 0, scoringVersion: "match-v1.2" },
      canonical: oldCanonical,
      evidenceVersion: null,
      invalidations: 0,
    };
    const applicationSnapshot = Object.freeze({
      fitSnapshot: Object.freeze({
        evidenceCoverage: 0,
        scoringVersion: "match-v1.2",
      }),
      state: "PREPARING",
    });
    const initialApplicationSnapshot = JSON.stringify(applicationSnapshot);
    const sourceRequest = vi.fn(async () => Response.json(sourcePayload));
    const target = (): CanonicalJobRefreshTarget => ({
      id: "job-101",
      company: "Acme",
      contentHash: canonicalJobContentHash(state.canonical),
      evidenceVersion: state.evidenceVersion,
      primarySource: {
        applicationUrl: sourcePayload.absolute_url,
        externalId: "101",
        source: "GREENHOUSE",
        sourceUrl: sourcePayload.absolute_url,
      },
    });
    const repository: JobEvidenceRefreshRepository = {
      findCanonicalRefreshTarget: async () => target(),
      mergeSourceAssociation: async (input) => {
        expect(input.canonicalJobId).toBe("job-101");
        expect(input.normalized.source.applicationUrl).toBe(
          sourcePayload.absolute_url,
        );
        const changed =
          state.evidenceVersion !== JOB_EVIDENCE_VERSION ||
          canonicalJobContentHash(state.canonical) !== input.contentHash;
        state.canonical = input.normalized.canonical;
        state.evidenceVersion = JOB_EVIDENCE_VERSION;
        if (changed) {
          state.analysis = null;
          state.invalidations += 1;
        }
      },
    };
    const createAdapter = () =>
      new GreenhouseJobSource(
        { boardToken: "acme", company: "Acme" },
        sourceRequest,
      );

    const refreshed = await refreshJobEvidence({
      createAdapter,
      jobId: "job-101",
      observedAt: new Date("2026-09-02T00:00:00.000Z"),
      repository,
    });

    expect(refreshed).toEqual({
      canonicalJobId: "job-101",
      evidenceChanged: true,
    });
    expect(sourceRequest).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs/101?content=true",
      expect.objectContaining({ redirect: "error" }),
    );
    expect(state.evidenceVersion).toBe(JOB_EVIDENCE_VERSION);
    expect(state.canonical.requirements).toEqual([
      expect.objectContaining({
        minimumExperienceMonths: 36,
        skillName: "Python",
        statement: "3+ years of Python",
      }),
      expect.objectContaining({
        skillName: "network automation",
        statement: "Experience with network automation",
      }),
    ]);
    expect(state.analysis).toBeNull();
    expect(state.invalidations).toBe(1);

    const job = buildJobMatchSnapshot({
      educationRequirements: state.canonical
        .educationRequirements as Prisma.JsonValue,
      employmentType: state.canonical.employmentType,
      experienceRequirements: state.canonical
        .experienceRequirements as Prisma.JsonValue,
      locations: state.canonical.locations as Prisma.JsonValue,
      preferredRequirements: state.canonical
        .preferredRequirements as Prisma.JsonValue,
      remoteType: state.canonical.remoteType,
      requirements: state.canonical.requirements as Prisma.JsonValue,
      salaryMax: null,
      seniority: null,
      skills: null,
      sponsorship: null,
      workAuthorization: null,
    });
    const emptyCandidate = buildCandidateMatchSnapshot({
      authorization: null,
      candidateFacts: [],
      educationRecords: [],
      preferences: null,
      projects: [],
      skills: [],
      workExperiences: [],
    });
    const emptyAnalysis = matchCandidateToJob(emptyCandidate, job);
    expect(emptyAnalysis.scoringVersion).toBe("match-v1.2");
    expect(emptyAnalysis.qualificationScore).toBeNull();
    expect(emptyAnalysis.overallFit).toBeNull();
    expect(emptyAnalysis.evidenceCoverage).toBe(0);
    expect(emptyAnalysis.gaps).toHaveLength(0);
    expect(emptyAnalysis.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobEvidence: expect.objectContaining({
            statement: "3+ years of Python",
          }),
        }),
        expect.objectContaining({
          jobEvidence: expect.objectContaining({
            statement: "Experience with network automation",
          }),
        }),
      ]),
    );

    const evidencedCandidate = buildCandidateMatchSnapshot({
      authorization: null,
      candidateFacts: [],
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
    const currentAnalysis = matchCandidateToJob(evidencedCandidate, job);
    expect(currentAnalysis.evidenceCoverage).toBeGreaterThan(0);
    state.analysis = currentAnalysis;

    const unchanged = await refreshJobEvidence({
      createAdapter,
      jobId: "job-101",
      observedAt: new Date("2026-09-02T00:05:00.000Z"),
      repository,
    });
    expect(unchanged?.evidenceChanged).toBe(false);
    expect(state.invalidations).toBe(1);
    expect(state.analysis).toBe(currentAnalysis);
    expect(JSON.stringify(applicationSnapshot)).toBe(
      initialApplicationSnapshot,
    );
    expect(currentMatchAnalysisWhere("candidate-1")).toEqual(
      expect.objectContaining({
        scoringVersion: "match-v1.2",
        job: { evidenceVersion: JOB_EVIDENCE_VERSION },
      }),
    );
  });
});
