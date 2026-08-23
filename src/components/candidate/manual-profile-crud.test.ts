import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CandidateTruthVault } from "@/integrations/candidate/prisma-truth-vault";
import { EducationSection } from "./truth-vault-sections";

describe("manual Profile collection controls", () => {
  it("renders independent records plus a fresh create control", () => {
    const vault = {
      education: [
        {
          id: "education-a",
          institution: "Synthetic University A",
          program: "Program A",
          credential: "Credential A",
          startDate: null,
          endDate: null,
          status: null,
          coursework: [],
        },
        {
          id: "education-b",
          institution: "Synthetic University B",
          program: "Program B",
          credential: "Credential B",
          startDate: null,
          endDate: null,
          status: null,
          coursework: [],
        },
      ],
    } as unknown as CandidateTruthVault;
    const markup = renderToStaticMarkup(
      createElement(EducationSection, { vault }),
    );
    expect(markup).toContain("Synthetic University A");
    expect(markup).toContain("Synthetic University B");
    expect(markup.match(/Update education/gu)).toHaveLength(2);
    expect(markup.match(/aria-label="Delete education"/gu)).toHaveLength(2);
    expect(markup).toContain("+ Add another education");
    expect(markup).toContain("Add education");
  });
});
