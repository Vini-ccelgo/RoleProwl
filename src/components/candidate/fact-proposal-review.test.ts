import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FactProposalReview } from "./fact-proposal-review";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const proposal = {
  confidence: 0.98,
  factType: "PROFILE_EMAIL",
  id: "proposal-1",
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
});
