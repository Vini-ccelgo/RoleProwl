import { describe, expect, it, vi } from "vitest";
import {
  interpretDocumentDeletionFailure,
  requestCandidateDocumentDeletion,
} from "./document-deletion-protocol";

describe("candidate document deletion client protocol", () => {
  it("preserves the exact safe consequence preview", () => {
    expect(
      interpretDocumentDeletionFailure({
        acceptedFactCount: 7,
        code: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
        error: "Confirm deletion.",
        fileName: "exact_resume.pdf",
        preSubmissionApplicationCount: 2,
        retainedHistoricalApplicationCount: 37,
        storageKey: "not-forwarded",
      }),
    ).toEqual({
      consequences: {
        acceptedFactCount: 7,
        fileName: "exact_resume.pdf",
        preSubmissionApplicationCount: 2,
        retainedHistoricalApplicationCount: 37,
      },
      kind: "CONFIRMATION_REQUIRED",
      message: "Confirm deletion.",
    });
  });

  it("fails closed for malformed consequence metadata", () => {
    expect(
      interpretDocumentDeletionFailure({
        code: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
        error: "Confirm deletion.",
        fileName: "resume.pdf",
      }),
    ).toEqual({ kind: "FAILED", message: "Confirm deletion." });
  });

  it("sends only the explicit server confirmation flag", async () => {
    const request = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(
      requestCandidateDocumentDeletion(
        { confirmDeletion: true, documentId: "document-1" },
        request,
      ),
    ).resolves.toEqual({ kind: "DELETED" });
    expect(request).toHaveBeenCalledWith(
      "/api/candidate/documents/document-1",
      {
        body: JSON.stringify({ confirmDeletion: true }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      },
    );
  });

  it("does not send client counts on the preview request", async () => {
    const request = vi.fn(async () =>
      Response.json(
        {
          acceptedFactCount: 0,
          code: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
          error: "Confirm deletion.",
          fileName: "resume.pdf",
          preSubmissionApplicationCount: 0,
          retainedHistoricalApplicationCount: 0,
        },
        { status: 409 },
      ),
    );

    await expect(
      requestCandidateDocumentDeletion(
        { confirmDeletion: false, documentId: "document-1" },
        request,
      ),
    ).resolves.toMatchObject({ kind: "CONFIRMATION_REQUIRED" });
    expect(request).toHaveBeenCalledWith(
      "/api/candidate/documents/document-1",
      { method: "DELETE" },
    );
  });
});
