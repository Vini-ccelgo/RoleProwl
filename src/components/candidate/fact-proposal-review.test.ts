import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FactProposalReview } from "./fact-proposal-review";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const proposal = {
  confidence: 0.98,
  documentId: "document-1",
  factType: "PROFILE_EMAIL",
  id: "proposal-1",
  sourceFileName: "roleprowl_synthetic_resume_maya_calder.pdf",
  sourceText: "synthetic@example.test",
  supported: true,
  value: "synthetic@example.test",
};

describe("fact proposal review component", () => {
  it("renders only original acceptance and rejection for unchanged values", () => {
    const markup = renderToStaticMarkup(
      createElement(FactProposalReview, { proposals: [proposal] }),
    );

    expect(markup).toContain("Accept original");
    expect(markup).not.toContain("Accept edited");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Destination: Profile email");
    expect(markup).toContain('class="proposal-review-input"');
    expect(markup).not.toContain("parser confidence");
    expect(markup).not.toContain("98%");
    expect(markup).toContain(
      "Source résumé: roleprowl_synthetic_resume_maya_calder.pdf",
    );
    expect(markup).toContain("Extracted source: “synthetic@example.test”");
  });

  it("renders unsupported historical proposals as reject-only", () => {
    const markup = renderToStaticMarkup(
      createElement(FactProposalReview, {
        proposals: [
          {
            ...proposal,
            factType: "UNKNOWN_TEXT",
            supported: false,
          },
        ],
      }),
    );

    expect(markup).not.toContain("Accept original");
    expect(markup).not.toContain("Accept edited");
    expect(markup).toContain("can only be rejected");
    expect(markup).toContain("Reject");
  });

  it("keeps proposals grouped and attributed to two different résumés", () => {
    const markup = renderToStaticMarkup(
      createElement(FactProposalReview, {
        proposals: [
          proposal,
          {
            ...proposal,
            documentId: "document-2",
            id: "proposal-2",
            sourceFileName: "second_resume.pdf",
            sourceText: "Built detection tooling",
            value: "Built detection tooling",
          },
        ],
      }),
    );
    expect(markup).toContain(
      "Source résumé: roleprowl_synthetic_resume_maya_calder.pdf",
    );
    expect(markup).toContain("Source résumé: second_resume.pdf");
    expect(markup).toContain("Extracted source: “Built detection tooling”");
  });

  it("presents only the remaining document proposals after a cascade deletion", () => {
    const remaining = {
      ...proposal,
      documentId: "document-2",
      id: "proposal-2",
      sourceFileName: "remaining_resume.pdf",
    };
    const markup = renderToStaticMarkup(
      createElement(FactProposalReview, { proposals: [remaining] }),
    );
    expect(markup).toContain("remaining_resume.pdf");
    expect(markup).not.toContain("roleprowl_synthetic_resume_maya_calder.pdf");
  });

  it("wraps a long unbroken source filename without losing its full value", () => {
    const fileName =
      "averyveryveryveryveryveryverylongunbrokenresumefilename.pdf";
    const markup = renderToStaticMarkup(
      createElement(FactProposalReview, {
        proposals: [{ ...proposal, sourceFileName: fileName }],
      }),
    );

    expect(markup).toContain(fileName);
    expect(markup.match(/safe-filename/gu)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps long proposed and provenance values inside shrinkable card descendants", () => {
    const longValue = "x".repeat(300);
    const markup = renderToStaticMarkup(
      createElement(FactProposalReview, {
        proposals: [
          {
            ...proposal,
            sourceFileName: `${"resume_".repeat(40)}.pdf`,
            sourceText: longValue,
            value: longValue,
          },
        ],
      }),
    );

    expect(markup).toContain("mobile-contained-grid");
    expect(markup).toContain("proposal-review-input");
    expect(markup).toContain("safe-user-text");
    expect(markup).toContain("proposal-review-actions");
    expect(markup).toContain(longValue);
  });
});
