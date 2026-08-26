import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documentFindFirst: vi.fn(),
  factCount: vi.fn(),
  applicationsFindMany: vi.fn(),
  removedFactsDeleteMany: vi.fn(async () => ({ count: 0 })),
  documentDeleteMany: vi.fn(async () => ({ count: 1 })),
  readyFindMany: vi.fn(async () => []),
  eventCreate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    candidateDocument: { findFirst: mocks.documentFindFirst },
    candidateFact: { count: mocks.factCount },
    application: { findMany: mocks.applicationsFindMany },
    $transaction: vi.fn(async (callback) =>
      callback({
        candidateFact: {
          count: mocks.factCount,
          deleteMany: mocks.removedFactsDeleteMany,
        },
        candidateDocument: {
          findFirst: mocks.documentFindFirst,
          deleteMany: mocks.documentDeleteMany,
        },
        application: {
          findMany: vi.fn(async (input) =>
            input?.where?.state === "READY"
              ? mocks.readyFindMany()
              : mocks.applicationsFindMany(input),
          ),
          updateMany: vi.fn(),
        },
        applicationEvent: { create: mocks.eventCreate },
      }),
    ),
  })),
}));

import { PrismaCandidateDocumentDeletion } from "./prisma-candidate-document-deletion";

describe("Prisma candidate document deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentFindFirst.mockResolvedValue({
      id: "document-1",
      storageKey: "candidate-documents/private",
    });
    mocks.factCount.mockResolvedValue(0);
    mocks.applicationsFindMany.mockResolvedValue([]);
  });

  it("deletes an unused owner document and its private object", async () => {
    const storage = { delete: vi.fn(async () => undefined) };
    await new PrismaCandidateDocumentDeletion(storage as never).delete({
      documentId: "document-1",
      userId: "user-1",
    });
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "document-1", userId: "user-1" },
      }),
    );
    expect(mocks.documentDeleteMany).toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith("candidate-documents/private");
  });

  it("blocks a résumé referenced by a pending application", async () => {
    mocks.applicationsFindMany.mockResolvedValue([
      {
        id: "application-1",
        submittedAt: null,
        documentsSnapshot: [
          { kind: "RESUME", storageKey: "candidate-documents/private" },
        ],
        submissionPayloadSnapshot: {},
      },
    ]);
    const storage = { delete: vi.fn() };
    await expect(
      new PrismaCandidateDocumentDeletion(storage as never).delete({
        documentId: "document-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Select another résumé");
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before deleting accepted résumé facts", async () => {
    mocks.factCount.mockResolvedValue(2);
    const storage = { delete: vi.fn() };
    await expect(
      new PrismaCandidateDocumentDeletion(storage as never).delete({
        documentId: "document-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      confirmationCode: "ACCEPTED_FACTS_DELETE_CONFIRMATION_REQUIRED",
      factCount: 2,
    });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(mocks.documentDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes ACTIVE and REMOVED sourced facts after explicit confirmation", async () => {
    mocks.factCount.mockResolvedValue(2);
    const storage = { delete: vi.fn(async () => undefined) };
    await new PrismaCandidateDocumentDeletion(storage as never).delete({
      confirmAcceptedFacts: true,
      documentId: "document-1",
      userId: "user-1",
    });
    expect(mocks.removedFactsDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: { in: ["ACTIVE", "REMOVED"] },
        sourceProposal: { documentId: "document-1" },
      },
    });
    expect(mocks.documentDeleteMany).toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith("candidate-documents/private");
  });

  it("preserves a résumé referenced by a submitted historical packet", async () => {
    mocks.factCount.mockResolvedValue(2);
    mocks.applicationsFindMany.mockResolvedValue([
      {
        id: "application-1",
        submittedAt: new Date(),
        documentsSnapshot: [],
        submissionPayloadSnapshot: {
          packet: {
            documents: [
              { storageKey: "candidate-documents/private", kind: "RESUME" },
            ],
          },
        },
      },
    ]);
    await expect(
      new PrismaCandidateDocumentDeletion({ delete: vi.fn() } as never).delete({
        confirmAcceptedFacts: true,
        documentId: "document-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("submitted application");
    expect(mocks.removedFactsDeleteMany).not.toHaveBeenCalled();
    expect(mocks.documentDeleteMany).not.toHaveBeenCalled();
  });

  it("does not report success when private storage deletion fails", async () => {
    const storage = {
      delete: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    };
    await expect(
      new PrismaCandidateDocumentDeletion(storage as never).delete({
        documentId: "document-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("provider unavailable");
  });

  it("conceals a foreign document", async () => {
    mocks.documentFindFirst.mockResolvedValue(null);
    await expect(
      new PrismaCandidateDocumentDeletion({ delete: vi.fn() } as never).delete({
        documentId: "foreign",
        userId: "user-1",
      }),
    ).rejects.toThrow("not found");
  });
});
