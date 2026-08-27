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
        applicationCount: 2,
        code: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
        documentId: "document-1",
        error: "Confirm deletion.",
        fileName: "exact_resume.pdf",
        storageKey: "not-forwarded",
      }),
    ).toEqual({
      consequences: {
        acceptedFactCount: 7,
        applicationCount: 2,
        documentId: "document-1",
        fileName: "exact_resume.pdf",
      },
      kind: "CONFIRMATION_REQUIRED",
      message: "Confirm deletion.",
    });
  });

  it("retains only safe submitted blockers for actionable rendering", () => {
    expect(
      interpretDocumentDeletionFailure({
        code: "SUBMITTED_APPLICATION_REFERENCES",
        error: "Submitted history prevents deletion.",
        applications: [
          {
            applicationId: "application-1",
            company: "Northstar Labs",
            jobTitle: "Security Engineer",
            storageKey: "not-forwarded",
          },
        ],
      }),
    ).toEqual({
      applications: [
        {
          applicationId: "application-1",
          company: "Northstar Labs",
          jobTitle: "Security Engineer",
        },
      ],
      kind: "SUBMITTED_BLOCKER",
      message: "Submitted history prevents deletion.",
    });
  });

  it("fails closed for malformed consequence or blocker metadata", () => {
    expect(
      interpretDocumentDeletionFailure({
        code: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
        error: "Confirm deletion.",
        fileName: "resume.pdf",
      }),
    ).toEqual({ kind: "FAILED", message: "Confirm deletion." });
    expect(
      interpretDocumentDeletionFailure({
        code: "SUBMITTED_APPLICATION_REFERENCES",
        error: "Deletion remains blocked.",
        applications: [{ applicationId: "private-only" }],
      }),
    ).toEqual({ kind: "FAILED", message: "Deletion remains blocked." });
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
          applicationCount: 0,
          code: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
          documentId: "document-1",
          error: "Confirm deletion.",
          fileName: "resume.pdf",
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
