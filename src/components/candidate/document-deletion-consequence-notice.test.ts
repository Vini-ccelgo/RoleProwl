import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentDeletionConsequenceNotice } from "./document-deletion-consequence-notice";

describe("document deletion consequence notice", () => {
  it("shows one complete warning with the exact server filename and counts", () => {
    const fileName =
      "roleprowl_exact_resume_name_with_many_underscores_final.pdf";
    const markup = renderToStaticMarkup(
      createElement(DocumentDeletionConsequenceNotice, {
        consequences: {
          acceptedFactCount: 7,
          applicationCount: 2,
          documentId: "document-1",
          fileName,
        },
        disabled: false,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }),
    );

    expect(markup).toContain(`Delete ${fileName}?`);
    expect(markup).toContain("2 pre-submission applications");
    expect(markup).toContain("7 accepted facts");
    expect(markup).toContain("Submitted application history is never");
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Delete résumé and dependent data");
    expect(markup).toContain('role="alertdialog"');
  });
});
