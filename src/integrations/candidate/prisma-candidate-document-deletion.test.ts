import { beforeEach, describe, expect, it, vi } from "vitest";

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
    state:
      | "PREPARING"
      | "READY"
      | "SUBMITTING"
      | "SUBMITTED"
      | "RESPONSE"
      | "CLOSED"
      | "FAILED";
    submissionPayloadSnapshot: unknown;
    submittedAt: Date | null;
  }> = {},
) {
  return {
    id,
    state: "PREPARING" as const,
    submittedAt: null,
    externalConfirmedAt: null,
    externalSubmissionId: null,
    job: { company: `Company ${id}`, title: `Role ${id}` },
    documentsSnapshot: [
      { kind: "RESUME", storageKey: "candidate-documents/private" },
    ],
    submissionPayloadSnapshot: {},
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
        applicationCount: 0,
        documentId: "document-1",
        fileName: "exact_resume.pdf",
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
      consequences: { applicationCount: 1 },
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
        documentsSnapshot: [],
        submissionPayloadSnapshot: {
          resumeStorageKey: "candidate-documents/private",
        },
      }),
      application("unrelated", {
        documentsSnapshot: [
          { kind: "RESUME", storageKey: "candidate-documents/other" },
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
    ).rejects.toMatchObject({ consequences: { applicationCount: 1 } });
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

  it("blocks confirmation when a fresh submitted dependency appears after preview", async () => {
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
    ).rejects.toMatchObject({ consequences: { applicationCount: 1 } });
    await expect(
      deletion.delete({
        confirmDeletion: true,
        documentId: "document-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      referenceCode: "SUBMITTED_APPLICATION_REFERENCES",
      applications: [{ applicationId: "new-history" }],
    });
    expect(mocks.applicationDeleteMany).not.toHaveBeenCalled();
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
  ])("hard-blocks protected application $id", async (protectedApplication) => {
    mocks.applicationsFindMany.mockResolvedValue([protectedApplication]);
    const objectStorage = storage();

    await expect(
      new PrismaCandidateDocumentDeletion(objectStorage as never).delete({
        confirmDeletion: true,
        documentId: "document-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      referenceCode: "SUBMITTED_APPLICATION_REFERENCES",
      applications: [{ applicationId: protectedApplication.id }],
    });
    expect(mocks.applicationDeleteMany).not.toHaveBeenCalled();
    expect(mocks.factsDeleteMany).not.toHaveBeenCalled();
    expect(objectStorage.delete).not.toHaveBeenCalled();
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
