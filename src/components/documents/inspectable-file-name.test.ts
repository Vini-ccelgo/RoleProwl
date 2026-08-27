import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  compactFileName,
  InspectableFileName,
  InspectableFileNameView,
} from "./inspectable-file-name";

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

      expect(markup).toContain("<button");
      expect(markup).toContain("Show full filename");
      expect(markup).toContain(fileName);
      expect(markup).toContain(`Show full filename: ${fileName}`);
      expect(markup).toContain('aria-expanded="false"');
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

  it("visibly renders the exact complete filename in the expanded state", () => {
    const fileName =
      "candidate_resume_with_a_complete_distinguishing_name_final_2.pdf";
    const markup = renderToStaticMarkup(
      createElement(InspectableFileNameView, {
        disclosureId: "full-file-name",
        expanded: true,
        fileName,
        onToggle: () => undefined,
      }),
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Hide full filename");
    expect(markup).toContain('id="full-file-name"');
    expect(markup).toContain(
      `<p class="safe-filename filename-inspector-full" id="full-file-name">${fileName}</p>`,
    );
  });
});
