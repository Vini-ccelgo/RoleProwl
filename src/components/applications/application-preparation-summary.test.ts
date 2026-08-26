import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApplicationPreparationSummary } from "./application-preparation-summary";

describe("application preparation summary", () => {
  it("shows useful prepared material", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationPreparationSummary, {
        answers: { authorization: true },
        fit: { confidence: 0.5, overallFit: 80 },
        generatedText: { COVER_LETTER: "Truthful prepared letter" },
        policy: { status: "NOT_EVALUATED" },
      }),
    );
    expect(markup).toContain("Estimated fit");
    expect(markup).toContain("Evidence coverage");
    expect(markup).toContain("Truthful prepared letter");
  });

  it("keeps absent answers unresolved instead of fabricating them", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationPreparationSummary, {
        answers: {},
        fit: { status: "NOT_ANALYZED" },
        generatedText: {},
        policy: { status: "NOT_EVALUATED" },
      }),
    );
    expect(markup).toContain("Unknown answers remain unresolved");
    expect(markup).not.toContain("Prepared writing");
    expect(markup).not.toContain("Application documents");
  });
});
