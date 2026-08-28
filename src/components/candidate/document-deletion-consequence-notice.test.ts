import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentDeletionConsequenceNotice } from "./document-deletion-consequence-notice";

describe("document deletion consequence notice", () => {
  function renderConsequences(input: {
    readonly acceptedFactCount: number;
    readonly preSubmissionApplicationCount: number;
    readonly retainedHistoricalApplicationCount: number;
  }) {
    return renderToStaticMarkup(
      createElement(DocumentDeletionConsequenceNotice, {
        consequences: {
          ...input,
          fileName:
            "roleprowl_exact_resume_name_with_many_underscores_final.pdf",
        },
        documentId: "document-1",
        disabled: false,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }),
    );
  }

  it("shows one complete warning with the exact server filename and counts", () => {
    const fileName =
      "roleprowl_exact_resume_name_with_many_underscores_final.pdf";
    const markup = renderToStaticMarkup(
      createElement(DocumentDeletionConsequenceNotice, {
        consequences: {
          acceptedFactCount: 7,
          fileName,
          preSubmissionApplicationCount: 2,
          retainedHistoricalApplicationCount: 37,
        },
        documentId: "document-1",
        disabled: false,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }),
    );

    expect(markup).toContain(`Delete ${fileName}?`);
    expect(markup).toContain("2 pre-submission applications");
    expect(markup).toContain("7 accepted facts");
    expect(markup).toContain("37 submitted or historical applications");
    expect(markup).toContain("immutable submitted résumé artifacts");
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Delete résumé and dependent data");
    expect(markup).toContain('role="alertdialog"');
  });

  it.each([
    {
      name: "no dependencies or history",
      input: {
        acceptedFactCount: 0,
        preSubmissionApplicationCount: 0,
        retainedHistoricalApplicationCount: 0,
      },
      label: "Delete résumé",
    },
    {
      name: "retained history only",
      input: {
        acceptedFactCount: 0,
        preSubmissionApplicationCount: 0,
        retainedHistoricalApplicationCount: 14,
      },
      label: "Delete résumé",
    },
    {
      name: "applications only",
      input: {
        acceptedFactCount: 0,
        preSubmissionApplicationCount: 3,
        retainedHistoricalApplicationCount: 0,
      },
      label: "Delete résumé and dependent data",
    },
    {
      name: "facts only",
      input: {
        acceptedFactCount: 2,
        preSubmissionApplicationCount: 0,
        retainedHistoricalApplicationCount: 0,
      },
      label: "Delete résumé and dependent data",
    },
    {
      name: "applications and facts",
      input: {
        acceptedFactCount: 2,
        preSubmissionApplicationCount: 3,
        retainedHistoricalApplicationCount: 14,
      },
      label: "Delete résumé and dependent data",
    },
  ])("uses truthful destructive copy for $name", ({ input, label }) => {
    const markup = renderConsequences(input);

    expect(markup).toContain(`>${label}</button>`);
    if (label === "Delete résumé")
      expect(markup).not.toContain(
        ">Delete résumé and dependent data</button>",
      );
  });

  it("keeps zero counts visible and separates retained history from deletion", () => {
    const zeroMarkup = renderConsequences({
      acceptedFactCount: 0,
      preSubmissionApplicationCount: 0,
      retainedHistoricalApplicationCount: 0,
    });
    expect(zeroMarkup).toContain("0 pre-submission applications");
    expect(zeroMarkup).toContain("0 accepted facts");
    expect(zeroMarkup).toContain("0 retained historical applications");
    expect(zeroMarkup).toContain(
      "No pre-submission applications or accepted facts will be deleted.",
    );

    const historyMarkup = renderConsequences({
      acceptedFactCount: 0,
      preSubmissionApplicationCount: 0,
      retainedHistoricalApplicationCount: 14,
    });
    expect(historyMarkup).toContain("14 submitted or historical applications");
    expect(historyMarkup).toContain("will remain in application history");
    expect(historyMarkup).toContain("are not part of this deletion");
  });
});
