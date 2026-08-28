import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(async () => ({ id: "audit-1" })),
  deletionRequestCreate: vi.fn(async () => ({ id: "request-1" })),
  transaction: vi.fn(),
  userFindUniqueOrThrow: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    $transaction: mocks.transaction,
  })),
}));

import { PrismaAccountDeletionRepository } from "./prisma-account-deletion-repository";

describe("Prisma account-deletion storage discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        accountDeletionRequest: { create: mocks.deletionRequestCreate },
        auditEvent: { create: mocks.auditCreate },
        user: { findUniqueOrThrow: mocks.userFindUniqueOrThrow },
      }),
    );
  });

  it("includes deduplicated résumé objects retained only by application history", async () => {
    mocks.userFindUniqueOrThrow.mockResolvedValue({
      externalAuthId: "clerk-user-1",
      candidateDocuments: [{ storageKey: "candidate-documents/active" }],
      resumeVersions: [{ renderedStorageKey: "resumes/tailored" }],
      applications: [
        {
          documentsSnapshot: [
            {
              kind: "RESUME",
              fileName: "historical.pdf",
              contentType: "application/pdf",
              storageKey: "candidate-documents/history-only",
            },
          ],
        },
        {
          documentsSnapshot: [
            {
              kind: "RESUME",
              fileName: "active.pdf",
              contentType: "application/pdf",
              storageKey: "candidate-documents/active",
            },
          ],
        },
        { documentsSnapshot: { malformed: true } },
      ],
    });

    await expect(
      new PrismaAccountDeletionRepository().begin({ userId: "user-1" }),
    ).resolves.toEqual({
      externalAuthId: "clerk-user-1",
      requestId: "request-1",
      storageKeys: [
        "candidate-documents/active",
        "resumes/tailored",
        "candidate-documents/history-only",
      ],
    });
    expect(mocks.userFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        externalAuthId: true,
        candidateDocuments: { select: { storageKey: true } },
        resumeVersions: { select: { renderedStorageKey: true } },
        applications: { select: { documentsSnapshot: true } },
      },
    });
    expect(mocks.deletionRequestCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalAuthId: "clerk-user-1",
        storageKeys: [
          "candidate-documents/active",
          "resumes/tailored",
          "candidate-documents/history-only",
        ],
      }),
    });
  });
});
