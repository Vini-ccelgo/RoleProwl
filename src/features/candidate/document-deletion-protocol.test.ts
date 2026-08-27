import { describe, expect, it, vi } from "vitest";
import {
  interpretDocumentDeletionFailure,
  requestCandidateDocumentDeletion,
} from "./document-deletion-protocol";

describe("candidate document deletion client protocol", () => {
  it("retains every safe pending blocker for actionable client rendering", () => {
    expect(
      interpretDocumentDeletionFailure({
        code: "PENDING_APPLICATION_REFERENCES",
        error: "Switch the pending applications first.",
        applications: [
          {
            applicationId: "application-1",
            company: "Northstar Labs",
            jobTitle: "Security Engineer",
            storageKey: "not-forwarded",
          },
          {
            applicationId: "application-2",
            company: "Atlas Systems",
            jobTitle: "Platform Engineer",
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
        {
          applicationId: "application-2",
          company: "Atlas Systems",
          jobTitle: "Platform Engineer",
        },
      ],
      code: "PENDING_APPLICATION_REFERENCES",
      kind: "APPLICATION_BLOCKER",
      message: "Switch the pending applications first.",
    });
  });

  it("does not interpret malformed or empty application data as actionable", () => {
    expect(
      interpretDocumentDeletionFailure({
        code: "PENDING_APPLICATION_REFERENCES",
        error: "Deletion remains blocked.",
        applications: [
          {
            applicationId: "foreign-or-malformed",
            storageKey: "private/storage",
          },
        ],
      }),
    ).toEqual({ kind: "FAILED", message: "Deletion remains blocked." });
  });

  it("sends only explicit accepted-fact confirmation and parses a blocker response", async () => {
    const request = vi.fn(async () =>
      Response.json(
        {
          applications: [
            {
              applicationId: "application-1",
              company: "Northstar Labs",
              jobTitle: "Security Engineer",
            },
          ],
          code: "PENDING_APPLICATION_REFERENCES",
          error: "Switch the pending application first.",
        },
        { status: 409 },
      ),
    );

    await expect(
      requestCandidateDocumentDeletion(
        { confirmAcceptedFacts: true, documentId: "document-1" },
        request,
      ),
    ).resolves.toMatchObject({
      code: "PENDING_APPLICATION_REFERENCES",
      kind: "APPLICATION_BLOCKER",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/candidate/documents/document-1",
      {
        body: JSON.stringify({ confirmAcceptedFacts: true }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      },
    );
  });

  it("preserves the accepted-fact count for the explicit second confirmation", () => {
    expect(
      interpretDocumentDeletionFailure({
        code: "ACCEPTED_FACTS_DELETE_CONFIRMATION_REQUIRED",
        error: "Accepted facts will be removed.",
        factCount: 4,
      }),
    ).toEqual({
      factCount: 4,
      kind: "ACCEPTED_FACTS_CONFIRMATION",
      message: "Accepted facts will be removed.",
    });
  });
});
