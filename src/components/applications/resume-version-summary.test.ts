import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumeVersionSummary } from "./resume-version-summary";

describe("resume version summary", () => {
  it("suppresses an empty résumé version", () => {
    const markup = renderToStaticMarkup(
      createElement(ResumeVersionSummary, {
        resumeVersion: {
          id: "resume-version-id",
          renderedFileName: "",
          templateVersion: "",
          promptVersion: "",
        },
      }),
    );
    expect(markup).not.toContain("Résumé version");
    expect(markup).not.toContain("resume-version-id");
  });

  it("renders candidate-visible résumé information", () => {
    const markup = renderToStaticMarkup(
      createElement(ResumeVersionSummary, {
        resumeVersion: {
          id: "resume-version-id",
          renderedFileName: "tailored-resume.pdf",
          templateVersion: "template-v1",
          promptVersion: "prompt-v1",
        },
      }),
    );
    expect(markup).toContain("Résumé version");
    expect(markup).toContain("tailored-resume.pdf");
  });
});
