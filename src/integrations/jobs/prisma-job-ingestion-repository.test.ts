import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const jobFindUniqueOrThrow = vi.fn();
  const jobCreate = vi.fn(async () => ({ id: "job-created" }));
  const jobUpdate = vi.fn(async () => ({ id: "job-1" }));
  const matchDeleteMany = vi.fn(async () => ({ count: 1 }));
  const sourceUpsert = vi.fn(async () => ({ id: "source-1" }));
  const transaction = {
    job: {
      findUniqueOrThrow: jobFindUniqueOrThrow,
      update: jobUpdate,
    },
    jobMatchAnalysis: { deleteMany: matchDeleteMany },
    jobSourceRecord: { upsert: sourceUpsert },
  };
  return {
    jobFindUniqueOrThrow,
    jobCreate,
    jobUpdate,
    matchDeleteMany,
    sourceUpsert,
    transaction: vi.fn(
      async (operation: (client: typeof transaction) => unknown) =>
        operation(transaction),
    ),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: () => ({
    $transaction: mocks.transaction,
    job: { create: mocks.jobCreate },
  }),
}));

import type { NormalizedSourceJob } from "@/core/contracts/job-source-adapter";
import { PrismaJobIngestionRepository } from "./prisma-job-ingestion-repository";

const normalized: NormalizedSourceJob = {
  canonical: {
    canonicalApplicationUrl: "https://boards.greenhouse.io/example/jobs/1",
    company: "Example",
    description: "Requirements\n• TypeScript",
    educationRequirements: null,
    employmentType: "FULL_TIME",
    experienceRequirements: null,
    expiresAt: null,
    locations: ["Remote"],
    postedAt: null,
    preferredRequirements: null,
    remoteType: "REMOTE",
    requirements: ["TypeScript"],
    salaryCurrency: null,
    salaryInterval: null,
    salaryMax: null,
    salaryMin: null,
    seniority: null,
    skills: ["TypeScript"],
    sponsorship: null,
    title: "Engineer",
    workAuthorization: null,
  },
  source: {
    applicationUrl: "https://boards.greenhouse.io/example/jobs/1",
    externalId: "1",
    payload: { id: 1 },
    source: "GREENHOUSE",
    sourceUrl: "https://boards-api.greenhouse.io/v1/boards/example/jobs/1",
  },
};

describe("PrismaJobIngestionRepository job evidence refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists explicit criteria and their provenance on fresh canonical creation", async () => {
    await expect(
      new PrismaJobIngestionRepository().createCanonicalWithSource({
        contentHash: "new-hash",
        normalized,
        observedAt: new Date("2026-09-02T00:00:00.000Z"),
      }),
    ).resolves.toBe("job-created");

    expect(mocks.jobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentHash: "new-hash",
          evidenceVersion: "job-evidence-v2",
          requirements: normalized.canonical.requirements,
        }),
      }),
    );
  });

  it("invalidates existing analyses when canonical job evidence changes", async () => {
    mocks.jobFindUniqueOrThrow.mockResolvedValue({
      contentHash: "old-hash",
      evidenceVersion: "job-evidence-v2",
      sourceRecords: [{ externalId: "1", source: "GREENHOUSE" }],
    });
    await new PrismaJobIngestionRepository().mergeSourceAssociation({
      canonicalJobId: "job-1",
      contentHash: "new-hash",
      normalized,
      observedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(mocks.jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          contentHash: "new-hash",
          requirements: normalized.canonical.requirements,
        }),
      }),
    );
    expect(mocks.matchDeleteMany).toHaveBeenCalledWith({
      where: { jobId: "job-1" },
    });
  });

  it("keeps current analyses when the canonical evidence hash is unchanged", async () => {
    mocks.jobFindUniqueOrThrow.mockResolvedValue({
      contentHash: "same-hash",
      evidenceVersion: "job-evidence-v2",
      sourceRecords: [{ externalId: "1", source: "GREENHOUSE" }],
    });
    await new PrismaJobIngestionRepository().mergeSourceAssociation({
      canonicalJobId: "job-1",
      contentHash: "same-hash",
      normalized,
      observedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(mocks.matchDeleteMany).not.toHaveBeenCalled();
    expect(mocks.sourceUpsert).toHaveBeenCalledOnce();
  });

  it("invalidates analyses when unchanged source content was normalized by an older evidence version", async () => {
    mocks.jobFindUniqueOrThrow.mockResolvedValue({
      contentHash: "same-hash",
      evidenceVersion: null,
      sourceRecords: [{ externalId: "1", source: "GREENHOUSE" }],
    });
    await new PrismaJobIngestionRepository().mergeSourceAssociation({
      canonicalJobId: "job-1",
      contentHash: "same-hash",
      normalized,
      observedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(mocks.jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentHash: "same-hash",
          evidenceVersion: "job-evidence-v2",
        }),
      }),
    );
    expect(mocks.matchDeleteMany).toHaveBeenCalledWith({
      where: { jobId: "job-1" },
    });
  });

  it("does not let a secondary source overwrite canonical evidence authority", async () => {
    mocks.jobFindUniqueOrThrow.mockResolvedValue({
      contentHash: "canonical-hash",
      evidenceVersion: null,
      sourceRecords: [{ externalId: "primary", source: "MANUAL" }],
    });
    await new PrismaJobIngestionRepository().mergeSourceAssociation({
      canonicalJobId: "job-1",
      contentHash: "secondary-hash",
      normalized,
      observedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(mocks.jobUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        lastSeenAt: new Date("2026-09-01T00:00:00.000Z"),
        lastVerifiedAt: new Date("2026-09-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    expect(mocks.matchDeleteMany).not.toHaveBeenCalled();
    expect(mocks.sourceUpsert).toHaveBeenCalledOnce();
  });
});
