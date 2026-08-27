import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compactFileName, InspectableFileName } from "./inspectable-file-name";

const cases = [
  "a-very-long-ordinary-resume-filename-for-mobile-review.pdf",
  "candidate_resume_with_many_many_many_many_underscores_2026.docx",
  "candidate resume with many spaces and a descriptive role name.pdf",
  "averylongextensionpreservingresumefilenameforinspection.pdf",
  "averylongsingletokenresumefilenamethatcannotbreaknaturally",
];

describe("inspectable filename", () => {
  it.each(cases)(
    "preserves and exposes the complete filename: %s",
    (fileName) => {
      const markup = renderToStaticMarkup(
        createElement(InspectableFileName, { fileName }),
      );

      expect(markup).toContain("<details");
      expect(markup).toContain("<summary");
      expect(markup).toContain("Show full filename");
      expect(markup).toContain(fileName);
      expect(markup).toContain(`Filename: ${fileName}. Activate`);
      expect(markup).not.toContain("title=");
    },
  );

  it("keeps a recognized extension visible in compact presentation", () => {
    const compact = compactFileName(
      "averyveryveryveryveryveryveryveryveryverylongresume.docx",
      32,
    );
    expect(compact.endsWith(".docx")).toBe(true);
    expect(compact).toContain("…");
  });
});
