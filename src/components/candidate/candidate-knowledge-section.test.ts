import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCandidateKnowledgeCoverage } from "@/core/domain/candidate/candidate-knowledge";
import { CandidateKnowledgeSection } from "./candidate-knowledge-section";

const confirmedAt = new Date("2026-09-14T12:00:00Z");

function evidence(
  concept: Parameters<
    typeof buildCandidateKnowledgeCoverage
  >[0]["evidence"][number]["concept"],
  value: Readonly<Record<string, unknown>>,
  options?: {
    confirmedAt?: Date;
    source?: "ANSWER_MEMORY" | "CANDIDATE_DIRECT";
  },
) {
  return {
    concept,
    value,
    confirmedAt: options?.confirmedAt ?? confirmedAt,
    source: options?.source ?? ("ANSWER_MEMORY" as const),
    sourceId: `source-${concept}`,
    origin: "EXPLICIT" as const,
    autoAnswerAllowed: true,
    candidateApproved: true,
    reusable: true,
  };
}

function renderSnapshot(input: {
  coverage: ReturnType<typeof buildCandidateKnowledgeCoverage>;
  currentDetails?: ReturnType<typeof buildCandidateKnowledgeCoverage>;
  jurisdictions?: readonly unknown[];
  narratives?: readonly unknown[];
  proposals?: readonly unknown[];
}) {
  return renderToStaticMarkup(
    createElement(CandidateKnowledgeSection, {
      snapshot: {
        coverage: input.coverage,
        currentDetails: input.currentDetails ?? [],
        jurisdictions: input.jurisdictions ?? [],
        gapPrompts: [],
        narratives: input.narratives ?? [],
        proposals: input.proposals ?? [],
        counts: {
          known: input.coverage.filter((item) => item.status === "KNOWN")
            .length,
          worthCompleting: 0,
          optional: 0,
          conflicts: 0,
        },
      } as never,
    }),
  );
}

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
          currentDetails: [],
          jurisdictions: [],
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

  it("shows a saved recurring detail after reload without returning it to the gap selector", () => {
    const coverage = buildCandidateKnowledgeCoverage({
      evidence: [evidence("NOTICE_PERIOD", { text: "30 days" })],
      now: confirmedAt,
    });
    const notice = coverage.find((item) => item.concept === "NOTICE_PERIOD")!;
    const markup = renderSnapshot({ coverage, currentDetails: [notice] });
    const gapSelect = markup.match(
      /<select name="concept"[^>]*>(.*?)<\/select>/u,
    )?.[1];
    expect(markup).toContain("Your current reusable details");
    expect(markup).toContain("Notice period");
    expect(markup).toContain("30 days");
    expect(markup).toContain("Confirmed Sep 14, 2026");
    expect(markup).toContain("Remove saved answer");
    expect(gapSelect).not.toContain("NOTICE_PERIOD");
    expect(markup).not.toContain(">NOTICE_PERIOD<");
  });

  it("marks stale memory and offers reconfirmation without re-entry", () => {
    const coverage = buildCandidateKnowledgeCoverage({
      evidence: [
        evidence(
          "CURRENT_COMPENSATION",
          { amount: 6_500, currency: "BRL", period: "month" },
          { confirmedAt: new Date("2026-01-01T00:00:00Z") },
        ),
      ],
      now: confirmedAt,
    });
    const compensation = coverage.find(
      (item) => item.concept === "CURRENT_COMPENSATION",
    )!;
    const markup = renderSnapshot({
      coverage,
      currentDetails: [compensation],
    });
    expect(markup).toContain("BRL 6,500 / month");
    expect(markup).toContain("Needs confirmation");
    expect(markup).toContain("Still true");
    expect(markup).toContain('value="6500"');
  });

  it("shows and prefills saved BR authorization independently", () => {
    const coverage = buildCandidateKnowledgeCoverage({
      evidence: [
        evidence("WORK_AUTHORIZATION:BR", { status: "Authorized" }),
        evidence("SPONSORSHIP_REQUIREMENT:BR", { required: false }),
      ],
      now: confirmedAt,
    });
    const authorization = coverage.find(
      (item) => item.concept === "WORK_AUTHORIZATION:BR",
    )!;
    const sponsorship = coverage.find(
      (item) => item.concept === "SPONSORSHIP_REQUIREMENT:BR",
    )!;
    const markup = renderSnapshot({
      coverage,
      jurisdictions: [{ countryCode: "BR", authorization, sponsorship }],
    });
    expect(markup).toContain("Saved work authorization");
    expect(markup).toContain("Brazil");
    expect(markup).toContain("Authorized");
    expect(markup).toContain("Sponsorship: Not required");
    expect(markup).toContain(
      '<option value="AUTHORIZED" selected="">Authorized</option>',
    );
    expect(markup).toContain(
      '<option value="NOT_REQUIRED" selected="">Not required</option>',
    );
    expect(markup).toContain("Add work authorization for a jurisdiction");
  });

  it("keeps the latest source text for every broad narrative visible and editable", () => {
    const coverage = buildCandidateKnowledgeCoverage({
      evidence: [],
      now: confirmedAt,
    });
    const narratives = [
      ["professional", "PROFESSIONAL_CONTEXT", "Context the résumé misses."],
      ["details", "RECURRING_DETAILS", "My recurring application details."],
      ["preferences", "RECURRING_PREFERENCES", "My optional preferences."],
    ].map(([id, theme, content]) => ({
      id,
      theme,
      content,
      createdAt: confirmedAt,
      updatedAt: confirmedAt,
    }));
    const markup = renderSnapshot({ coverage, narratives });
    expect(markup).toContain("Context the résumé misses.");
    expect(markup).toContain("My recurring application details.");
    expect(markup).toContain("My optional preferences.");
    expect(markup.match(/Save updated answer/gu)).toHaveLength(3);
    expect(markup).toContain(
      "Updating an answer does not approve suggestions or remove previously approved reusable details.",
    );
  });

  it("renders pending proposals produced for an updated narrative", () => {
    const coverage = buildCandidateKnowledgeCoverage({
      evidence: [],
      now: confirmedAt,
    });
    const markup = renderSnapshot({
      coverage,
      narratives: [
        {
          id: "narrative-updated",
          theme: "PROFESSIONAL_CONTEXT",
          content: "I now want product security roles.",
          createdAt: confirmedAt,
          updatedAt: confirmedAt,
        },
      ],
      proposals: [
        {
          id: "proposal-1",
          concept: "TARGET_ROLE",
          proposedValue: { text: "Product security roles" },
          supportingText: "product security roles",
          narrative: { theme: "PROFESSIONAL_CONTEXT" },
        },
      ],
    });
    expect(markup).toContain("Review suggested reusable details");
    expect(markup).toContain("Product security roles");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Save correction");
    expect(markup).toContain("Decline");
  });
});
