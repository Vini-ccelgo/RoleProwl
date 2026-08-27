import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  confirmResumeDeletion,
  confirmResumeFactDeletion,
  RESUME_FACT_DELETION_WARNING,
  ResumeImporter,
} from "./resume-importer";

describe("résumé file picker", () => {
  it("uses one file input with an explicit accessible trigger and status", () => {
    const markup = renderToStaticMarkup(
      createElement(ResumeImporter, { documents: [] }),
    );

    expect(markup.match(/type="file"/gu)).toHaveLength(1);
    expect(markup).toContain('id="resume-file-input"');
    expect(markup).toContain('aria-controls="resume-file-input"');
    expect(markup).toContain("Choose File");
    expect(markup).toContain("No file selected");
  });

  it("shows a durable warning for incomplete structured interpretation", () => {
    const markup = renderToStaticMarkup(
      createElement(ResumeImporter, {
        documents: [
          {
            createdAt: "2026-08-27T12:00:00.000Z",
            format: "PDF",
            id: "document-1",
            interpretationStatus: "INCOMPLETE",
            originalFileName: "synthetic-resume.pdf",
            proposalCount: 1,
            sizeBytes: 2048,
            status: "EXTRACTED",
          },
        ],
      }),
    );

    expect(markup).toContain("Machine-readable text was extracted");
    expect(markup).toContain("could not reliably identify much structured");
    expect(markup).toContain("text-selectable PDF");
  });

  it("keeps a long document filename fully available through touch inspection", () => {
    const fileName =
      "candidate_resume_with_a_very_long_single_token_name_for_mobile.pdf";
    const markup = renderToStaticMarkup(
      createElement(ResumeImporter, {
        documents: [
          {
            createdAt: "2026-08-27T12:00:00.000Z",
            format: "PDF",
            id: "document-1",
            originalFileName: fileName,
            proposalCount: 1,
            sizeBytes: 2048,
            status: "EXTRACTED",
          },
        ],
      }),
    );

    expect(markup).toContain("document-management-row");
    expect(markup).toContain("document-management-details");
    expect(markup).toContain("filename-inspector");
    expect(markup).toContain("Show full filename");
    expect(markup).toContain(fileName);
    expect(markup).toContain(`aria-label="Delete ${fileName}"`);
    expect(markup).not.toContain('class="truncate');
  });
});

describe("résumé accepted-fact deletion confirmation", () => {
  it("allows the candidate to cancel without confirming destructive deletion", () => {
    const confirmOperator = vi.fn(() => false);
    expect(
      confirmResumeFactDeletion("exact_resume.pdf", 3, confirmOperator),
    ).toBe(false);
    expect(confirmOperator).toHaveBeenCalledWith(
      expect.stringContaining(RESUME_FACT_DELETION_WARNING),
    );
    expect(confirmOperator).toHaveBeenCalledWith(
      expect.stringContaining("3 accepted facts"),
    );
    expect(confirmOperator).toHaveBeenCalledWith(
      expect.stringContaining("Résumé: exact_resume.pdf"),
    );
  });

  it("requires an explicit affirmative confirmation", () => {
    expect(confirmResumeFactDeletion("resume.pdf", 1, () => true)).toBe(true);
  });

  it("identifies the exact document in the initial destructive confirmation", () => {
    const confirmOperator = vi.fn(() => true);
    expect(
      confirmResumeDeletion("similar_resume_final_2.pdf", confirmOperator),
    ).toBe(true);
    expect(confirmOperator).toHaveBeenCalledWith(
      expect.stringContaining("Résumé: similar_resume_final_2.pdf"),
    );
  });
});
