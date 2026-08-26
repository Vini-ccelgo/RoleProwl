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

import { AcceptedFactsDeleteConfirmationRequiredError } from "@/integrations/candidate/prisma-candidate-document-deletion";
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

describe("candidate document DELETE protocol", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a structured confirmation requirement without confirming deletion", async () => {
    deleteDocument.mockRejectedValueOnce(
      new AcceptedFactsDeleteConfirmationRequiredError(3),
    );
    const response = await DELETE(request(), {
      params: Promise.resolve({ documentId: "document-1" }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACCEPTED_FACTS_DELETE_CONFIRMATION_REQUIRED",
      factCount: 3,
    });
    expect(deleteDocument).toHaveBeenCalledWith({
      confirmAcceptedFacts: false,
      documentId: "document-1",
      userId: "user-1",
    });
  });

  it("passes only an explicit boolean confirmation to the deletion service", async () => {
    deleteDocument.mockResolvedValueOnce(undefined);
    const response = await DELETE(request({ confirmAcceptedFacts: true }), {
      params: Promise.resolve({ documentId: "document-1" }),
    });
    expect(response.status).toBe(204);
    expect(deleteDocument).toHaveBeenCalledWith({
      confirmAcceptedFacts: true,
      documentId: "document-1",
      userId: "user-1",
    });
  });
});
