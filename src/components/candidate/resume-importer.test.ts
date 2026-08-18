import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ResumeImporter } from "./resume-importer";

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
