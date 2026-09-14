import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCandidateKnowledgeCoverage } from "@/core/domain/candidate/candidate-knowledge";
import { CandidateKnowledgeSection } from "./candidate-knowledge-section";

describe("candidate knowledge profile gaps", () => {
  it("keeps generic gaps jurisdiction-neutral and offers explicit structured entry", () => {
    const coverage = buildCandidateKnowledgeCoverage({
      evidence: [],
      now: new Date("2026-09-14T00:00:00Z"),
    });
    const markup = renderToStaticMarkup(
      createElement(CandidateKnowledgeSection, {
        snapshot: {
          coverage,
          gapPrompts: [],
          narratives: [],
          proposals: [],
          counts: {
            known: 0,
            worthCompleting: coverage.length,
            optional: 0,
            conflicts: 0,
          },
        } as never,
      }),
    );
    expect(markup).not.toContain("us work authorization");
    expect(markup).not.toContain("us future sponsorship");
    expect(markup).not.toContain("US_WORK_AUTHORIZATION");
    expect(markup).not.toContain("US_FUTURE_SPONSORSHIP");
    expect(markup).toContain("Add work authorization for a jurisdiction");
    expect(markup).toContain('name="jurisdictionCountryCode"');
    expect(markup).toContain('name="workAuthorization"');
    expect(markup).toContain('name="sponsorshipRequirement"');
    expect(markup).toContain(
      "location, nationality, and résumé location are not used",
    );
  });
});
