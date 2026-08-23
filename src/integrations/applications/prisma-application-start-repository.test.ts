import { beforeEach, describe, expect, it, vi } from "vitest";

const { applicationCreate, applicationFindFirst, auditCreate, jobFindFirst } =
  vi.hoisted(() => ({
    applicationCreate: vi.fn(),
    applicationFindFirst: vi.fn(),
    auditCreate: vi.fn(async () => undefined),
    jobFindFirst: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    $transaction: vi.fn(async (callback) =>
      callback({
        application: {
          create: applicationCreate,
          findFirst: applicationFindFirst,
        },
        auditEvent: { create: auditCreate },
        job: { findFirst: jobFindFirst },
      }),
    ),
  })),
}));

import { PrismaApplicationStartRepository } from "./prisma-application-start-repository";

const job = {
  id: "job-1",
  candidateDispositions: [],
  matchAnalyses: [
    {
      confidence: 0.75,
      overallFit: 82,
      preferenceScore: 80,
      qualificationScore: 83,
      scoringVersion: "match-v1.1",
    },
  ],
  resumeVersions: [],
  reviewQueueItems: [],
  sourceRecords: [
    {
      applicationUrl: "https://boards.greenhouse.io/example/jobs/1",
      externalId: "1",
      source: "GREENHOUSE",
    },
  ],
  writingArtifacts: [],
};

describe("Prisma application start repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobFindFirst.mockResolvedValue(job);
    applicationCreate.mockResolvedValue({
      id: "application-1",
      state: "PREPARING",
    });
  });

  it("creates once and returns the existing candidate/job record on retry", async () => {
    applicationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "application-1", state: "PREPARING" });
    const repository = new PrismaApplicationStartRepository();
    const input = { jobId: "job-1", userId: "user-1" };
    const first = await repository.createOrGet(input);
    const repeated = await repository.createOrGet(input);
    expect(first.created).toBe(true);
    expect(repeated).toEqual({
      applicationId: "application-1",
      created: false,
      state: "PREPARING",
    });
    expect(applicationCreate).toHaveBeenCalledOnce();
    expect(applicationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", jobId: "job-1" } }),
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("blocks preparation for a candidate-rejected job", async () => {
    applicationFindFirst.mockResolvedValue(null);
    jobFindFirst.mockResolvedValue({
      ...job,
      candidateDispositions: [{ status: "REJECTED" }],
    });
    await expect(
      new PrismaApplicationStartRepository().createOrGet({
        jobId: "job-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Reconsider this job");
    expect(applicationCreate).not.toHaveBeenCalled();
  });
});
