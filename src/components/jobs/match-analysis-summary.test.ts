import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchAnalysisSummary } from "./match-analysis-summary";

describe("match analysis summary", () => {
  it("presents sparse evidence as preliminary uncertainty rather than failure", () => {
    const markup = renderToStaticMarkup(
      createElement(MatchAnalysisSummary, {
        analysis: {
          confidence: 1,
          conflicts: [],
          evidenceCoverage: 0.25,
          gaps: [],
          hardConflicts: [],
          overallFit: null,
          partialMatches: [],
          preferenceScore: null,
          qualificationScore: null,
          scoringVersion: "match-v1.2",
          strengths: [
            {
              assessment: "SUPPORTED",
              category: "QUALIFICATION",
              code: "REQUIRED_SKILL_typescript",
              evidence: "Exact evidence for TypeScript",
              label: "Required skill: TypeScript",
            },
          ],
          unknowns: [
            {
              assessment: "UNKNOWN",
              category: "QUALIFICATION",
              code: "EDUCATION_UNKNOWN",
              evidence: "Candidate evidence is missing",
              label: "education is unknown",
            },
          ],
        },
      }),
    );
    expect(markup).toContain("Not enough evidence to estimate fit");
    expect(markup).toContain("Evidence coverage");
    expect(markup).toContain("25%");
    expect(markup).not.toContain("Estimated fit");
    expect(markup).toContain("Unknown / missing evidence");
    expect(markup).toContain("Improve this assessment");
    expect(markup).toContain("/profile#education");
    expect(markup).not.toContain("You lack");
  });

  it("does not show a numeric fit when every criterion is unknown", () => {
    const markup = renderToStaticMarkup(
      createElement(MatchAnalysisSummary, {
        analysis: {
          confidence: 0,
          conflicts: [],
          evidenceCoverage: 0,
          gaps: [],
          hardConflicts: [],
          overallFit: null,
          partialMatches: [],
          preferenceScore: null,
          qualificationScore: null,
          scoringVersion: "match-v1.2",
          strengths: [],
          unknowns: [
            {
              assessment: "UNKNOWN",
              category: "QUALIFICATION",
              code: "REQUIRED_SKILL_rust",
              evidence: "No verified candidate skill evidence yet",
              label: "Required skill: Rust",
            },
          ],
        },
      }),
    );
    expect(markup).toContain("Not enough evidence to estimate fit");
    expect(markup).toContain("Missing evidence is unknown");
    expect(markup).not.toContain("50%<!-- -->");
  });
});
