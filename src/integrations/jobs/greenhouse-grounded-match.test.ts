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

  it("turns the hosted compound posting into atomic Python evidence without fabricating the unresolved clauses", async () => {
    const statements = [
      "Minimum of 8 years of software engineering experience with a Bachelor's degree in Computer Science, Engineering, or a related field; alternatively, 6+ years with a Master's degree, 3+ years with a PhD, or equivalent professional experience.",
      "Strong Python development experience, including multithreaded programming and performance optimization.",
      "Working proficiency in C and C++, with the ability to read, debug, build, and modify compiled analysis components.",
      "Experience deploying and maintaining machine learning inference solutions in production using frameworks such as PyTorch, LightGBM, scikit-learn, or ONNX.",
      "Familiarity with KVM/libvirt or similar virtualization technologies and a working knowledge of Windows internals, with the ability to develop deeper expertise.",
      "Experience with malware analysis, sandbox technologies, threat detection platforms, or cybersecurity software.",
    ] as const;
    const source = new GreenhouseJobSource({
      boardToken: "acme",
      company: "Acme",
    });
    const normalized = await source.normalize({
      applicationUrl: "https://boards.greenhouse.io/acme/jobs/103",
      externalId: "103",
      payload: {
        absolute_url: "https://boards.greenhouse.io/acme/jobs/103",
        content: `<h2>Requirements</h2><ul>${statements.map((statement) => `<li>${statement}</li>`).join("")}</ul>`,
        id: 103,
        title: "Senior Software Engineer — Python exp is a must",
      },
      source: "GREENHOUSE",
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/103",
    });
    const canonicalRequirements = normalized.canonical.requirements ?? [];
    expect(canonicalRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "SKILL",
          skillName: "Python",
          statement: statements[1],
        }),
        expect.objectContaining({
          kind: "OTHER",
          logicalContext: "ALTERNATIVE",
          statement: statements[0],
        }),
      ]),
    );
    expect(canonicalRequirements).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillName: expect.stringContaining("Bachelor's degree"),
        }),
      ]),
    );

    const job = buildJobMatchSnapshot({
      educationRequirements: null,
      employmentType: null,
      experienceRequirements: null,
      locations: null,
      preferredRequirements: null,
      remoteType: null,
      requirements: canonicalRequirements as Prisma.JsonValue,
      salaryMax: null,
      seniority: null,
      skills: null,
      sponsorship: null,
      workAuthorization: null,
    });
    expect(job.requiredSkills?.map((skill) => skill.name)).toEqual([
      "Python",
      "C",
      "C++",
      "Windows internals",
    ]);
    expect(job.requiredSkills?.map((skill) => skill.name)).not.toEqual(
      expect.arrayContaining([
        "PyTorch",
        "LightGBM",
        "scikit-learn",
        "ONNX",
        "KVM",
        "libvirt",
      ]),
    );

    const withPython = matchCandidateToJob(
      buildCandidateMatchSnapshot({
        authorization: null,
        candidateFacts: [{ factType: "SKILL_TEXT", value: { text: "Python" } }],
        educationRecords: [],
        preferences: null,
        projects: [],
        skills: [],
        workExperiences: [],
      }),
      job,
    );
    const persistedAnalysis = {
      jobId: "job-103",
      userId: "candidate-1",
      ...withPython,
    };
    expect(persistedAnalysis.strengths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "MATCH",
          code: "REQUIRED_SKILL_python",
          jobEvidence: expect.objectContaining({ statement: statements[1] }),
        }),
      ]),
    );
    expect(persistedAnalysis.evidenceCoverage).toBeGreaterThan(0);
    expect(persistedAnalysis.evidenceCoverage).toBeLessThan(0.5);
    expect(persistedAnalysis.qualificationScore).toBeNull();
    expect(persistedAnalysis.overallFit).toBeNull();
    expect(persistedAnalysis.gaps).toHaveLength(0);
    expect(persistedAnalysis.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "UNKNOWN",
          jobEvidence: expect.objectContaining({ statement: statements[0] }),
        }),
      ]),
    );
    expect(persistedAnalysis.unknowns).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REQUIRED_SKILL_pytorch" }),
        expect.objectContaining({ code: "REQUIRED_SKILL_kvm" }),
      ]),
    );
    expect(persistedAnalysis.scoringVersion).toBe("match-v1.2");

    const withoutPython = matchCandidateToJob(
      buildCandidateMatchSnapshot({
        authorization: null,
        candidateFacts: [],
        educationRecords: [],
        preferences: null,
        projects: [],
        skills: [],
        workExperiences: [],
      }),
      job,
    );
    expect(withoutPython.evidenceCoverage).toBe(0);
    expect(withoutPython.gaps).toHaveLength(0);
    expect(withoutPython.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessment: "UNKNOWN",
          code: "REQUIRED_SKILL_python",
          jobEvidence: expect.objectContaining({ statement: statements[1] }),
        }),
      ]),
    );
  });
});
