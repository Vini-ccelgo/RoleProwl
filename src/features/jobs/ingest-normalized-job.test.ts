import { describe, expect, it, vi } from "vitest";
import type { NormalizedSourceJob } from "@/core/contracts/job-source-adapter";
import {
  ingestNormalizedJob,
  type JobIngestionRepository,
} from "./ingest-normalized-job";

const incoming: NormalizedSourceJob = {
  source: {
    source: "LEVER",
    externalId: "lever-1",
    sourceUrl: null,
    applicationUrl: "https://apply.test/1",
    payload: {},
  },
  canonical: {
    company: "Acme",
    title: "Engineer",
    description:
      "Build reliable distributed product systems with the platform team.",
    canonicalApplicationUrl: "https://apply.test/1",
    locations: ["Remote"],
    remoteType: "REMOTE",
    employmentType: "FULL_TIME",
    seniority: "MID",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryInterval: null,
    requirements: null,
    preferredRequirements: null,
    skills: null,
    educationRequirements: null,
    experienceRequirements: null,
    workAuthorization: null,
    sponsorship: null,
    postedAt: null,
    expiresAt: null,
  },
};

it("stores a new source association when cross-source deduplication matches", async () => {
  const mergeSourceAssociation = vi.fn(async () => undefined);
  const repository: JobIngestionRepository = {
    findDeduplicationCandidates: async () => [
      {
        id: "canonical-1",
        source: "GREENHOUSE",
        externalId: "greenhouse-1",
        applicationUrl: "https://apply.test/1",
        company: "Acme",
        title: "Engineer",
        description: incoming.canonical.description,
        locations: ["Remote"],
        seniority: "MID",
        contentHash: "other-hash",
        postedAt: null,
        lastSeenAt: new Date(),
        status: "ACTIVE",
      },
    ],
    mergeSourceAssociation,
    createCanonicalWithSource: vi.fn(async () => "new"),
  };
  const result = await ingestNormalizedJob(incoming, repository);
  expect(result).toMatchObject({
    canonicalJobId: "canonical-1",
    created: false,
    reason: "APPLICATION_URL",
  });
  expect(mergeSourceAssociation).toHaveBeenCalledWith(
    expect.objectContaining({ canonicalJobId: "canonical-1" }),
  );
});

describe("new canonical ingestion", () => {
  it("creates a canonical job and source record when no conservative match exists", async () => {
    const createCanonicalWithSource = vi.fn(async () => "canonical-new");
    const repository: JobIngestionRepository = {
      findDeduplicationCandidates: async () => [],
      mergeSourceAssociation: vi.fn(async () => undefined),
      createCanonicalWithSource,
    };
    expect(await ingestNormalizedJob(incoming, repository)).toMatchObject({
      canonicalJobId: "canonical-new",
      created: true,
    });
    expect(createCanonicalWithSource).toHaveBeenCalledOnce();
  });
});
