import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  applicationCreate,
  applicationFindFirst,
  auditCreate,
  candidateDocumentFindFirst,
  jobFindFirst,
} = vi.hoisted(() => ({
  applicationCreate: vi.fn(),
  applicationFindFirst: vi.fn(),
  auditCreate: vi.fn(async () => undefined),
  candidateDocumentFindFirst: vi.fn(),
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
        candidateDocument: { findFirst: candidateDocumentFindFirst },
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
    candidateDocumentFindFirst.mockResolvedValue(null);
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

  it("snapshots a tailored résumé with its canonical document kind", async () => {
    applicationFindFirst.mockResolvedValue(null);
    jobFindFirst.mockResolvedValue({
      ...job,
      resumeVersions: [
        {
          id: "resume-version-1",
          renderedFileName: "tailored.docx",
          renderedContentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          renderedStorageKey: "resume-versions/tailored",
        },
      ],
    });
    await new PrismaApplicationStartRepository().createOrGet({
      jobId: "job-1",
      userId: "user-1",
    });
    expect(candidateDocumentFindFirst).not.toHaveBeenCalled();
    expect(applicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resumeVersionId: "resume-version-1",
          documentsSnapshot: [
            {
              kind: "RESUME",
              fileName: "tailored.docx",
              contentType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              storageKey: "resume-versions/tailored",
            },
          ],
          submissionPayloadSnapshot: expect.objectContaining({
            documents: [
              {
                kind: "RESUME",
                fileName: "tailored.docx",
                contentType:
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                storageKey: "resume-versions/tailored",
              },
            ],
          }),
        }),
      }),
    );
  });

  it("uses the latest extracted CandidateDocument when no tailored résumé exists", async () => {
    applicationFindFirst.mockResolvedValue(null);
    candidateDocumentFindFirst.mockResolvedValue({
      originalFileName: "uploaded.pdf",
      mimeType: "application/pdf",
      storageKey: "candidate-documents/uploaded",
    });
    await new PrismaApplicationStartRepository().createOrGet({
      jobId: "job-1",
      userId: "user-1",
    });
    expect(candidateDocumentFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "EXTRACTED" },
      orderBy: { createdAt: "desc" },
      select: {
        originalFileName: true,
        mimeType: true,
        storageKey: true,
      },
    });
    expect(applicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resumeVersionId: null,
          documentsSnapshot: [
            {
              kind: "RESUME",
              fileName: "uploaded.pdf",
              contentType: "application/pdf",
              storageKey: "candidate-documents/uploaded",
            },
          ],
          submissionPayloadSnapshot: expect.objectContaining({
            documents: [
              {
                kind: "RESUME",
                fileName: "uploaded.pdf",
                contentType: "application/pdf",
                storageKey: "candidate-documents/uploaded",
              },
            ],
          }),
        }),
      }),
    );
  });
});
