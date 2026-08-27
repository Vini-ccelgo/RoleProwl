import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteDocument } = vi.hoisted(() => ({
  deleteDocument: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/lib/security/request-security", () => ({
  assertMutationRequestIsSameOrigin: vi.fn(),
}));
vi.mock(
  "@/integrations/candidate/prisma-candidate-document-deletion",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/integrations/candidate/prisma-candidate-document-deletion")
      >();
    return {
      ...actual,
      PrismaCandidateDocumentDeletion: class {
        delete = deleteDocument;
      },
    };
  },
);

import {
  CandidateDocumentApplicationReferenceError,
  DocumentDeletionConfirmationRequiredError,
} from "@/integrations/candidate/prisma-candidate-document-deletion";
import { DELETE } from "./route";

function request(body?: unknown) {
  return new Request(
    "https://roleprowl.test/api/candidate/documents/document-1",
    {
      method: "DELETE",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

const consequences = {
  acceptedFactCount: 7,
  applicationCount: 2,
  documentId: "document-1",
  fileName: "exact_resume.pdf",
};

describe("candidate document DELETE protocol", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a safe consequence preview without confirming deletion", async () => {
    deleteDocument.mockRejectedValueOnce(
      new DocumentDeletionConfirmationRequiredError(consequences),
    );
    const response = await DELETE(request(), {
      params: Promise.resolve({ documentId: "document-1" }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ...consequences,
      code: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
      error: "Confirm deletion of this résumé and its dependent data.",
    });
    expect(deleteDocument).toHaveBeenCalledWith({
      confirmDeletion: false,
      documentId: "document-1",
      userId: "user-1",
    });
  });

  it("passes only an explicit boolean confirmation to the deletion service", async () => {
    deleteDocument.mockResolvedValueOnce(undefined);
    const response = await DELETE(
      request({
        acceptedFactCount: 0,
        applicationCount: 0,
        confirmDeletion: true,
        userId: "attacker-supplied",
      }),
      {
        params: Promise.resolve({ documentId: "document-1" }),
      },
    );
    expect(response.status).toBe(204);
    expect(deleteDocument).toHaveBeenCalledWith({
      confirmDeletion: true,
      documentId: "document-1",
      userId: "user-1",
    });
  });

  it("returns only safe owner-authorized descriptors for submitted blockers", async () => {
    deleteDocument.mockRejectedValueOnce(
      new CandidateDocumentApplicationReferenceError([
        {
          applicationId: "application-1",
          company: "Northstar Labs",
          jobTitle: "Security Engineer",
        },
      ]),
    );
    const response = await DELETE(request(), {
      params: Promise.resolve({ documentId: "document-1" }),
    });
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload).toEqual({
      applications: [
        {
          applicationId: "application-1",
          company: "Northstar Labs",
          jobTitle: "Security Engineer",
        },
      ],
      code: "SUBMITTED_APPLICATION_REFERENCES",
      error:
        "This résumé is retained because an active or historical submission depends on it.",
    });
    expect(JSON.stringify(payload)).not.toContain("storageKey");
    expect(JSON.stringify(payload)).not.toContain("candidateId");
    expect(JSON.stringify(payload)).not.toContain("documentsSnapshot");
  });

  it("sanitizes structured failures across production module boundaries", async () => {
    deleteDocument.mockRejectedValueOnce({
      consequences: {
        ...consequences,
        storageKey: "must-not-be-forwarded",
      },
      confirmationCode: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
      message: "Confirm deletion.",
      protocolKind: "CANDIDATE_DOCUMENT_DELETION_CONFIRMATION",
    });

    const response = await DELETE(request(), {
      params: Promise.resolve({ documentId: "document-1" }),
    });
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload).toEqual({
      ...consequences,
      code: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
      error: "Confirm deletion.",
    });
    expect(JSON.stringify(payload)).not.toContain("storageKey");
  });
});
