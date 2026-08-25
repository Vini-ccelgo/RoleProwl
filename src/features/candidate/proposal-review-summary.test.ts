import { describe, expect, it } from "vitest";
import {
  pendingProposalReviewQuery,
  proposalReviewSelect,
  proposalReviewSummary,
} from "./proposal-review-summary";

function proposal(documentId: string, sourceFileName: string, id: string) {
  return {
    confidence: 0.8,
    document: { id: documentId, originalFileName: sourceFileName },
    factType: "SKILL_TEXT",
    id,
    proposedValue: { text: "Built detection tooling" },
    sourceRegion: { lineStart: 4, lineEnd: 4, text: "Built tooling" },
    targetPath: "candidateFacts.skills",
  };
}

describe("proposal review source attribution", () => {
  it("selects only public source-document identity", () => {
    expect(pendingProposalReviewQuery("candidate-1")).toMatchObject({
      where: { userId: "candidate-1", status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    expect(proposalReviewSelect.document).toEqual({
      select: { id: true, originalFileName: true },
    });
    expect(JSON.stringify(proposalReviewSelect)).not.toMatch(
      /storageKey|contentHash|extraction|mimeType|sizeBytes/u,
    );
  });

  it("retains distinct source filenames for proposals from two documents", () => {
    const summaries = [
      proposalReviewSummary(
        proposal("document-1", "first_resume.pdf", "proposal-1"),
      ),
      proposalReviewSummary(
        proposal("document-2", "second_resume.pdf", "proposal-2"),
      ),
    ];
    expect(
      summaries.map(({ documentId, sourceFileName }) => ({
        documentId,
        sourceFileName,
      })),
    ).toEqual([
      { documentId: "document-1", sourceFileName: "first_resume.pdf" },
      { documentId: "document-2", sourceFileName: "second_resume.pdf" },
    ]);
    for (const summary of summaries) {
      expect(summary).not.toHaveProperty("storageKey");
      expect(summary).not.toHaveProperty("contentHash");
      expect(summary).not.toHaveProperty("extraction");
    }
  });

  it("maps only proposals returned after the deleted document cascades", () => {
    const remainingRows = [
      proposal("document-2", "remaining_resume.pdf", "proposal-2"),
    ];
    const summaries = remainingRows.map(proposalReviewSummary);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      documentId: "document-2",
      sourceFileName: "remaining_resume.pdf",
    });
  });
});
