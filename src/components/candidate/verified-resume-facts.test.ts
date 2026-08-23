import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CandidateTruthVault } from "@/integrations/candidate/prisma-truth-vault";
import { VerifiedResumeFactsSection } from "./truth-vault-sections";

describe("verified résumé facts rendering", () => {
  it("renders an accepted value and its source provenance", () => {
    const vault = {
      verifiedResumeFacts: [
        {
          id: "fact-1",
          factType: "PROFILE_EMAIL",
          value: { text: "synthetic@example.test" },
          sourceProposal: {
            id: "proposal-1",
            status: "EDITED_AND_ACCEPTED",
            targetPath: "candidateProfile.email",
            sourceRegion: { text: "Original synthetic contact line" },
            document: {
              id: "document-1",
              originalFileName: "jordan-mercer-synthetic.pdf",
            },
          },
        },
      ],
    } as unknown as CandidateTruthVault;

    const markup = renderToStaticMarkup(
      createElement(VerifiedResumeFactsSection, { vault }),
    );

    expect(markup).toContain("Profile email");
    expect(markup).toContain("synthetic@example.test");
    expect(markup).toContain("jordan-mercer-synthetic.pdf");
    expect(markup).toContain("Original synthetic contact line");
    expect(markup).toContain("EDITED AND ACCEPTED");
    expect(markup).toContain("Edit active value");
    expect(markup).toContain("Save correction");
    expect(markup).toContain("Remove from active facts");
  });

  it("renders a clear empty state", () => {
    const vault = {
      verifiedResumeFacts: [],
    } as unknown as CandidateTruthVault;
    const markup = renderToStaticMarkup(
      createElement(VerifiedResumeFactsSection, { vault }),
    );
    expect(markup).toContain("No résumé proposals have been accepted yet.");
  });
});
