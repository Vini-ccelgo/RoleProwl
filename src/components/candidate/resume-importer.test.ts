import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  confirmResumeFactDeletion,
  RESUME_FACT_DELETION_WARNING,
  ResumeImporter,
} from "./resume-importer";

describe("résumé file picker", () => {
  it("uses one file input with an explicit accessible trigger and status", () => {
    const markup = renderToStaticMarkup(
      createElement(ResumeImporter, { documents: [] }),
    );

    expect(markup.match(/type="file"/gu)).toHaveLength(1);
    expect(markup).toContain('id="resume-file-input"');
    expect(markup).toContain('aria-controls="resume-file-input"');
    expect(markup).toContain("Choose File");
    expect(markup).toContain("No file selected");
  });
});

describe("résumé accepted-fact deletion confirmation", () => {
  it("allows the candidate to cancel without confirming destructive deletion", () => {
    const confirmOperator = vi.fn(() => false);
    expect(confirmResumeFactDeletion(confirmOperator)).toBe(false);
    expect(confirmOperator).toHaveBeenCalledWith(RESUME_FACT_DELETION_WARNING);
  });

  it("requires an explicit affirmative confirmation", () => {
    expect(confirmResumeFactDeletion(() => true)).toBe(true);
  });
});
