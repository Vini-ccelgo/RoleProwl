import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actorId: "user-1",
  applications: new Map<string, Record<string, unknown>>(),
  documents: new Map<
    string,
    {
      id: string;
      originalFileName: string;
      storageKey: string;
      userId: string;
    }
  >(),
  objects: new Map<string, Uint8Array>(),
}));

const mocks = vi.hoisted(() => ({
  skillSynchronization: vi.fn(async () => ({ changed: false })),
  storageDelete: vi.fn(async (storageKey: string) => {
    state.objects.delete(storageKey);
  }),
  storageGet: vi.fn(async (storageKey: string) =>
    state.objects.get(storageKey),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor: vi.fn(async () => ({ id: state.actorId })),
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/integrations/storage/document-storage", () => ({
  documentStorage: vi.fn(() => ({
    delete: mocks.storageDelete,
    get: mocks.storageGet,
    put: vi.fn(),
  })),
}));
vi.mock("./sync-verified-candidate-skills", () => ({
  synchronizeVerifiedCandidateSkills: mocks.skillSynchronization,
}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => {
    const applicationFindFirst = vi.fn(async (input) => {
      const application = state.applications.get(input.where.id);
      return application && application.userId === input.where.userId
        ? { documentsSnapshot: application.documentsSnapshot }
        : null;
    });
    const transaction = {
      application: {
        deleteMany: vi.fn(async (input) => {
          let count = 0;
          for (const id of input.where.id.in) {
            const application = state.applications.get(id);
            if (application?.userId === input.where.userId) {
              state.applications.delete(id);
              count += 1;
            }
          }
          return { count };
        }),
        findMany: vi.fn(async (input) => {
          if (input.where.state === "READY") return [];
          return [...state.applications.values()].filter(
            (application) => application.userId === input.where.userId,
          );
        }),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      applicationEvent: { create: vi.fn() },
      candidateDocument: {
        deleteMany: vi.fn(async (input) => {
          const document = state.documents.get(input.where.id);
          if (!document || document.userId !== input.where.userId)
            return { count: 0 };
          state.documents.delete(document.id);
          return { count: 1 };
        }),
        findFirst: vi.fn(async (input) => {
          const document = state.documents.get(input.where.id);
          return document?.userId === input.where.userId ? document : null;
        }),
      },
      candidateFact: {
        count: vi.fn(async () => 0),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      jobMatchAnalysis: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      notification: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    };
    return {
      application: { findFirst: applicationFindFirst },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
  }),
}));

import { GET } from "@/app/api/applications/[applicationId]/resume/route";
import { documentStorage } from "@/integrations/storage/document-storage";
import { PrismaCandidateDocumentDeletion } from "./prisma-candidate-document-deletion";

const historicalStorageKey = "candidate-documents/historical-private";
const historicalBytes = new Uint8Array([37, 80, 68, 70, 45, 104, 105]);
const historicalSnapshot = [
  {
    kind: "RESUME",
    fileName: "historical_resume.pdf",
    contentType: "application/pdf",
    storageKey: historicalStorageKey,
  },
];

describe("candidate document and immutable application history lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.actorId = "user-1";
    state.documents.clear();
    state.applications.clear();
    state.objects.clear();
    state.documents.set("document-1", {
      id: "document-1",
      originalFileName: "historical_resume.pdf",
      storageKey: historicalStorageKey,
      userId: "user-1",
    });
    state.applications.set("application-1", {
      id: "application-1",
      userId: "user-1",
      state: "SUBMITTED",
      submittedAt: new Date("2026-08-27T12:00:00.000Z"),
      externalConfirmedAt: null,
      externalSubmissionId: "employer-1",
      documentsSnapshot: structuredClone(historicalSnapshot),
      events: [],
    });
    state.objects.set(historicalStorageKey, historicalBytes);
  });

  it("deletes the active row while preserving exact historical bytes, name, type, ownership, and snapshot authority", async () => {
    const snapshotBefore = structuredClone(
      state.applications.get("application-1")?.documentsSnapshot,
    );
    const storage = documentStorage();

    await new PrismaCandidateDocumentDeletion(storage).delete({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });

    expect(state.documents.has("document-1")).toBe(false);
    expect(state.applications.has("application-1")).toBe(true);
    expect(state.applications.get("application-1")?.documentsSnapshot).toEqual(
      snapshotBefore,
    );
    expect(mocks.storageDelete).not.toHaveBeenCalledWith(historicalStorageKey);

    const response = await GET(new Request("https://roleprowl.test"), {
      params: Promise.resolve({ applicationId: "application-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      'filename="historical_resume.pdf"',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      historicalBytes,
    );
    expect(mocks.storageGet).toHaveBeenCalledWith(historicalStorageKey);

    mocks.storageGet.mockClear();
    state.actorId = "foreign-user";
    const foreignResponse = await GET(new Request("https://roleprowl.test"), {
      params: Promise.resolve({ applicationId: "application-1" }),
    });
    expect(foreignResponse.status).toBe(404);
    expect(mocks.storageGet).not.toHaveBeenCalled();

    state.actorId = "user-1";
    state.documents.set("document-2", {
      id: "document-2",
      originalFileName: "unrelated.pdf",
      storageKey: "candidate-documents/unrelated",
      userId: "user-1",
    });
    state.objects.set(
      "candidate-documents/unrelated",
      new Uint8Array([1, 2, 3]),
    );
    await new PrismaCandidateDocumentDeletion(storage).delete({
      confirmDeletion: true,
      documentId: "document-2",
      userId: "user-1",
    });
    expect(mocks.storageDelete).toHaveBeenCalledWith(
      "candidate-documents/unrelated",
    );

    const afterUnrelatedDeletion = await GET(
      new Request("https://roleprowl.test"),
      { params: Promise.resolve({ applicationId: "application-1" }) },
    );
    expect(new Uint8Array(await afterUnrelatedDeletion.arrayBuffer())).toEqual(
      historicalBytes,
    );
  });
});
