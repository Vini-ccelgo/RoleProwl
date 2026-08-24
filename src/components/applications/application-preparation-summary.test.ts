import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApplicationPreparationSummary } from "./application-preparation-summary";

describe("application preparation summary", () => {
  it("shows useful prepared material without exposing private storage keys", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationPreparationSummary, {
        answers: { authorization: true },
        documents: [
          {
            contentType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileName: "tailored-resume.docx",
            storageKey: "private/secret-key.docx",
          },
        ],
        fit: { confidence: 0.5, overallFit: 80 },
        generatedText: { COVER_LETTER: "Truthful prepared letter" },
        policy: { status: "NOT_EVALUATED" },
      }),
    );
    expect(markup).toContain("Estimated fit");
    expect(markup).toContain("Evidence coverage");
    expect(markup).toContain("Truthful prepared letter");
    expect(markup).toContain("tailored-resume.docx");
    expect(markup).not.toContain("private/secret-key.docx");
  });

  it("keeps absent answers unresolved instead of fabricating them", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationPreparationSummary, {
        answers: {},
        documents: [],
        fit: { status: "NOT_ANALYZED" },
        generatedText: {},
        policy: { status: "NOT_EVALUATED" },
      }),
    );
    expect(markup).toContain("Unknown answers remain unresolved");
    expect(markup).not.toContain("Prepared writing");
    expect(markup).not.toContain("Application documents");
  });

  it("suppresses document snapshots without candidate-visible information", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationPreparationSummary, {
        answers: {},
        documents: [null, {}, { storageKey: "private/only-a-key.docx" }],
        fit: {},
        generatedText: {},
        policy: {},
      }),
    );
    expect(markup).not.toContain("Application documents");
    expect(markup).not.toContain("Prepared document");
    expect(markup).not.toContain("private/only-a-key.docx");
  });
});
