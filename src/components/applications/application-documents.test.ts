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
});
