import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  applicationDeleteMany: vi.fn(async (input) => ({
    count: input.where.id.in.length,
  })),
  applicationsFindMany: vi.fn(),
  documentDeleteMany: vi.fn(async () => ({ count: 1 })),
  documentFindFirst: vi.fn(),
  eventCreate: vi.fn(),
  factCount: vi.fn(),
  factsDeleteMany: vi.fn(async () => ({ count: 0 })),
  notificationDeleteMany: vi.fn(async () => ({ count: 0 })),
  readyFindMany: vi.fn(async () => []),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    $transaction: mocks.transaction,
  })),
}));

import { PrismaCandidateDocumentDeletion } from "./prisma-candidate-document-deletion";

function application(
  id: string,
  overrides: Partial<{
    documentsSnapshot: unknown;
    externalConfirmedAt: Date | null;
    externalSubmissionId: string | null;
    events: readonly { id: string }[];
    state:
      | "PREPARING"
      | "READY"
      | "SUBMITTING"
      | "SUBMITTED"
      | "RESPONSE"
      | "CLOSED"
      | "FAILED";
    submittedAt: Date | null;
  }> = {},
) {
  return {
    id,
    state: "PREPARING" as const,
    submittedAt: null,
    externalConfirmedAt: null,
    externalSubmissionId: null,
    events: [],
    documentsSnapshot: [
      {
        kind: "RESUME",
        fileName: "exact_resume.pdf",
        contentType: "application/pdf",
        storageKey: "candidate-documents/private",
      },
    ],
    ...overrides,
  };
}

function storage(deleteObject = vi.fn(async () => undefined)) {
  return { delete: deleteObject };
}

describe("Prisma candidate document deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentFindFirst.mockResolvedValue({
      id: "document-1",
      originalFileName: "exact_resume.pdf",
      storageKey: "candidate-documents/private",
    });
    mocks.factCount.mockResolvedValue(0);
    mocks.applicationsFindMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        candidateFact: {
          count: mocks.factCount,
          deleteMany: mocks.factsDeleteMany,
        },
        candidateDocument: {
          findFirst: mocks.documentFindFirst,
          deleteMany: mocks.documentDeleteMany,
        },
        application: {
          deleteMany: mocks.applicationDeleteMany,
          findMany: vi.fn(async (input) =>
            input?.where?.state === "READY"
              ? mocks.readyFindMany()
              : mocks.applicationsFindMany(input),
          ),
          updateMany: vi.fn(),
        },
        applicationEvent: { create: mocks.eventCreate },
        notification: { deleteMany: mocks.notificationDeleteMany },
      }),
    );
  });

  it("previews an unused owner document without mutating it, then deletes on confirmation", async () => {
    const objectStorage = storage();
    const deletion = new PrismaCandidateDocumentDeletion(
      objectStorage as never,
    );

    await expect(
      deletion.delete({ documentId: "document-1", userId: "user-1" }),
    ).rejects.toMatchObject({
      confirmationCode: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
      consequences: {
        acceptedFactCount: 0,
        fileName: "exact_resume.pdf",
        preSubmissionApplicationCount: 0,
        retainedHistoricalApplicationCount: 0,
      },
    });
    expect(mocks.documentDeleteMany).not.toHaveBeenCalled();
    expect(objectStorage.delete).not.toHaveBeenCalled();

    await deletion.delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });
    expect(mocks.documentDeleteMany).toHaveBeenCalledWith({
      where: { id: "document-1", userId: "user-1" },
    });
    expect(objectStorage.delete).toHaveBeenCalledWith(
      "candidate-documents/private",
    );
    expect(mocks.transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("previews one referenced pre-submission application and cascades it on confirmation", async () => {
    mocks.applicationsFindMany.mockResolvedValue([
      application("application-1"),
    ]);
    const deletion = new PrismaCandidateDocumentDeletion(storage() as never);

    await expect(
      deletion.delete({ documentId: "document-1", userId: "user-1" }),
    ).rejects.toMatchObject({
      consequences: { preSubmissionApplicationCount: 1 },
    });
    expect(mocks.applicationDeleteMany).not.toHaveBeenCalled();

    await deletion.delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });
    expect(mocks.applicationDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["application-1"] }, userId: "user-1" },
    });
    expect(mocks.notificationDeleteMany).toHaveBeenCalledWith({
      where: {
        entityId: { in: ["application-1"] },
        entityType: "application",
        userId: "user-1",
      },
    });
  });

  it("deletes every referenced pre-submission application and preserves unrelated applications", async () => {
    mocks.applicationsFindMany.mockResolvedValue([
      application("application-1"),
      application("application-2", {
        state: "READY",
      }),
      application("unrelated", {
        documentsSnapshot: [
          {
            kind: "RESUME",
            fileName: "other.pdf",
            contentType: "application/pdf",
            storageKey: "candidate-documents/other",
          },
        ],
      }),
    ]);

    const deleteObject = vi.fn(async () => undefined);
    await new PrismaCandidateDocumentDeletion(
      storage(deleteObject) as never,
    ).delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });
    expect(mocks.applicationDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["application-1", "application-2"] },
        userId: "user-1",
      },
    });
    expect(
      mocks.notificationDeleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.applicationDeleteMany.mock.invocationCallOrder[0]);
    expect(
      mocks.applicationDeleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.factsDeleteMany.mock.invocationCallOrder[0]);
    expect(mocks.factsDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.documentDeleteMany.mock.invocationCallOrder[0],
    );
    expect(mocks.documentDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.readyFindMany.mock.invocationCallOrder[0],
    );
    expect(mocks.readyFindMany.mock.invocationCallOrder[0]).toBeLessThan(
      deleteObject.mock.invocationCallOrder[0],
    );
  });

  it("includes accepted facts in the same preview and deletes only document-sourced facts", async () => {
    mocks.factCount.mockResolvedValue(7);
    const deletion = new PrismaCandidateDocumentDeletion(storage() as never);

    await expect(
      deletion.delete({ documentId: "document-1", userId: "user-1" }),
    ).rejects.toMatchObject({
      consequences: { acceptedFactCount: 7 },
    });
    expect(mocks.factsDeleteMany).not.toHaveBeenCalled();

    await deletion.delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });
    expect(mocks.factsDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: { in: ["ACTIVE", "REMOVED"] },
        sourceProposal: { documentId: "document-1" },
      },
    });
  });

  it("uses fresh dependencies when confirmation follows the preview", async () => {
    mocks.applicationsFindMany
      .mockResolvedValueOnce([application("application-1")])
      .mockResolvedValueOnce([
        application("application-1"),
        application("application-2"),
      ]);
    const deletion = new PrismaCandidateDocumentDeletion(storage() as never);

    await expect(
      deletion.delete({ documentId: "document-1", userId: "user-1" }),
    ).rejects.toMatchObject({
      consequences: { preSubmissionApplicationCount: 1 },
    });
    await deletion.delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });
    expect(mocks.applicationDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["application-1", "application-2"] },
        userId: "user-1",
      },
    });
  });

  it("preserves a dependency that becomes submitted after preview and retains its storage object", async () => {
    mocks.applicationsFindMany
      .mockResolvedValueOnce([application("application-1")])
      .mockResolvedValueOnce([
        application("application-1"),
        application("new-history", { state: "SUBMITTED" }),
      ]);
    const objectStorage = storage();
    const deletion = new PrismaCandidateDocumentDeletion(
      objectStorage as never,
    );

    await expect(
      deletion.delete({ documentId: "document-1", userId: "user-1" }),
    ).rejects.toMatchObject({
      consequences: { preSubmissionApplicationCount: 1 },
    });
    await deletion.delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });
    expect(mocks.applicationDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["application-1"] }, userId: "user-1" },
    });
    expect(objectStorage.delete).not.toHaveBeenCalled();
  });

  it.each([
    application("submitted", { state: "SUBMITTED" }),
    application("response", { state: "RESPONSE" }),
    application("closed-history", {
      state: "CLOSED",
      submittedAt: new Date("2026-08-27"),
    }),
    application("submitting", { state: "SUBMITTING" }),
    application("event-history", {
      state: "CLOSED",
      events: [{ id: "submission-confirmed-event" }],
    }),
  ])("retains protected application $id", async (protectedApplication) => {
    mocks.applicationsFindMany.mockResolvedValue([protectedApplication]);
    const objectStorage = storage();

    await new PrismaCandidateDocumentDeletion(objectStorage as never).delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });
    expect(mocks.applicationDeleteMany).not.toHaveBeenCalled();
    expect(mocks.documentDeleteMany).toHaveBeenCalled();
    expect(objectStorage.delete).not.toHaveBeenCalled();
  });

  it("previews retained history separately from disposable dependencies", async () => {
    mocks.applicationsFindMany.mockResolvedValue([
      application("draft"),
      application("submitting", { state: "SUBMITTING" }),
      application("submitted", { state: "SUBMITTED" }),
      application("closed-history", {
        state: "CLOSED",
        externalSubmissionId: "employer-123",
      }),
    ]);

    await expect(
      new PrismaCandidateDocumentDeletion(storage() as never).delete({
        documentId: "document-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      consequences: {
        preSubmissionApplicationCount: 1,
        retainedHistoricalApplicationCount: 3,
      },
    });
  });

  it("resolves a deterministic mixed 250-application graph in one confirmation", async () => {
    const disposableApplications = Array.from({ length: 120 }, (_, index) =>
      application(`application-${index}`, {
        state:
          index % 3 === 0 ? "FAILED" : index % 3 === 1 ? "READY" : "CLOSED",
      }),
    );
    const retainedApplications = Array.from({ length: 80 }, (_, index) =>
      application(`history-${index}`, {
        state: index % 2 === 0 ? "SUBMITTED" : "CLOSED",
        submittedAt:
          index % 2 === 0 ? null : new Date("2026-08-27T12:00:00.000Z"),
      }),
    );
    const unrelatedApplications = Array.from({ length: 50 }, (_, index) =>
      application(`unrelated-${index}`, {
        documentsSnapshot: [
          {
            kind: "RESUME",
            fileName: "other.pdf",
            contentType: "application/pdf",
            storageKey: "candidate-documents/other",
          },
        ],
      }),
    );
    mocks.factCount.mockResolvedValue(60);
    mocks.applicationsFindMany.mockResolvedValue([
      ...disposableApplications,
      ...retainedApplications,
      ...unrelatedApplications,
    ]);
    const objectStorage = storage();
    const deletion = new PrismaCandidateDocumentDeletion(
      objectStorage as never,
    );

    await expect(
      deletion.delete({ documentId: "document-1", userId: "user-1" }),
    ).rejects.toMatchObject({
      consequences: {
        acceptedFactCount: 60,
        preSubmissionApplicationCount: 120,
        retainedHistoricalApplicationCount: 80,
      },
    });

    await deletion.delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });

    expect(mocks.applicationDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: disposableApplications.map(({ id }) => id) },
        userId: "user-1",
      },
    });
    expect(objectStorage.delete).not.toHaveBeenCalled();
  });

  it("recomputes a newly accepted fact on confirmation", async () => {
    mocks.factCount.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const deletion = new PrismaCandidateDocumentDeletion(storage() as never);

    await expect(
      deletion.delete({ documentId: "document-1", userId: "user-1" }),
    ).rejects.toMatchObject({ consequences: { acceptedFactCount: 1 } });
    await deletion.delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });

    expect(mocks.factCount).toHaveBeenCalledTimes(2);
    expect(mocks.factsDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: { in: ["ACTIVE", "REMOVED"] },
        sourceProposal: { documentId: "document-1" },
      },
    });
  });

  it("does not report complete deletion when private storage fails", async () => {
    const deleteObject = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    await expect(
      new PrismaCandidateDocumentDeletion(
        storage(deleteObject) as never,
      ).delete({
        confirmDeletion: true,
        documentId: "document-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("provider unavailable");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });

  it("retries an idempotent storage delete when the SQL commit conflicts", async () => {
    const deleteObject = vi.fn(async () => undefined);
    const transaction = mocks.transaction.getMockImplementation();
    mocks.transaction.mockImplementationOnce(async (...args) => {
      await transaction?.(...args);
      throw new Prisma.PrismaClientKnownRequestError("commit conflict", {
        clientVersion: "test",
        code: "P2034",
      });
    });

    await expect(
      new PrismaCandidateDocumentDeletion(
        storage(deleteObject) as never,
      ).delete({
        confirmDeletion: true,
        documentId: "document-1",
        userId: "user-1",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenCalledTimes(2);
  });

  it("maps only an exact serialization conflict to a generic retry-later result", async () => {
    mocks.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("write conflict", {
        clientVersion: "test",
        code: "P2034",
      }),
    );

    await expect(
      new PrismaCandidateDocumentDeletion(storage() as never).delete({
        confirmDeletion: true,
        documentId: "document-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "Résumé dependencies changed while deletion was in progress. Try again.",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });

  it("conceals a foreign document before dependency inspection", async () => {
    mocks.documentFindFirst.mockResolvedValue(null);
    await expect(
      new PrismaCandidateDocumentDeletion(storage() as never).delete({
        confirmDeletion: true,
        documentId: "foreign",
        userId: "user-1",
      }),
    ).rejects.toThrow("not found");
    expect(mocks.applicationsFindMany).not.toHaveBeenCalled();
  });
});
