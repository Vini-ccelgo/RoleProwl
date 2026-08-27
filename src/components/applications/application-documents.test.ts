import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplicationDocuments } from "./application-documents";

const selectedResume = {
  kind: "RESUME" as const,
  fileName: "Calder.pdf",
  contentType: "application/pdf",
  storageKey: "candidate-documents/private/calder",
};

describe("application documents", () => {
  it("separates the selected résumé from owner-scoped alternatives", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationDocuments, {
        applicationId: "application-1",
        mutable: true,
        selectedResume,
        alternatives: [
          { id: "document-b", originalFileName: "Park.pdf" },
          { id: "document-c", originalFileName: "Elena.pdf" },
        ],
        selectResumeAction: vi.fn(),
      }),
    );
    expect(markup).toContain("Selected for this application");
    expect(markup).toContain("Calder.pdf");
    expect(markup).toContain("Other available résumés");
    expect(markup).toContain("Park.pdf");
    expect(markup).toContain("Use for this application");
    expect(markup).not.toContain("candidate-documents/private/calder");
    expect(markup).not.toContain("contentHash");
  });

  it("shows only the historical selection for submitted applications", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationDocuments, {
        applicationId: "application-1",
        mutable: false,
        selectedResume,
        alternatives: [],
        selectResumeAction: vi.fn(),
      }),
    );
    expect(markup).toContain("historical résumé");
    expect(markup).toContain("Calder.pdf");
    expect(markup).not.toContain("Use for this application");
    expect(markup).not.toContain("Other available résumés");
  });

  it("provides touch inspection for similar long selected and alternative filenames", () => {
    const selected = "candidate_resume_security_engineer_final_1.pdf";
    const alternative = "candidate_resume_security_engineer_final_2.pdf";
    const markup = renderToStaticMarkup(
      createElement(ApplicationDocuments, {
        applicationId: "application-1",
        mutable: true,
        selectedResume: { ...selectedResume, fileName: selected },
        alternatives: [{ id: "document-b", originalFileName: alternative }],
        selectResumeAction: vi.fn(),
      }),
    );

    expect(markup).toContain(selected);
    expect(markup).toContain(alternative);
    expect(markup.match(/filename-inspector/gu)?.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(markup).toContain("Show full filename");
    expect(markup).not.toContain("title=");
  });
});
