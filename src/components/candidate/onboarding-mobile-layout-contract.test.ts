import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("onboarding mobile layout contract", () => {
  it("uses the centered bounded app container and dynamic viewport sizing", () => {
    const page = readFileSync("src/app/(app)/onboarding/page.tsx", "utf8");
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(page).toContain(
      'className="app-page mobile-contained-grid grid gap-7"',
    );
    expect(css).toMatch(
      /\.app-page \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?max-width: 1100px;[\s\S]*?margin: auto/u,
    );
    expect(css).toMatch(
      /\.app-frame \{[\s\S]*?min-height: 100vh;[\s\S]*?min-height: 100dvh/u,
    );
    expect(css).toMatch(/\.app-main \{[\s\S]*?min-width: 0;[\s\S]*?padding:/u);
    expect(css).not.toMatch(/body \{[^}]*overflow-y: hidden/u);
    expect(css).not.toMatch(/\.app-main \{[^}]*overflow-y: hidden/u);
  });

  it("uses an explicit 320px-safe document and proposal structure", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toMatch(
      /\.safe-filename \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-wrap: anywhere/u,
    );
    expect(css).toMatch(
      /\.mobile-contained-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*min-width: 0;[^}]*max-width: 100%/u,
    );
    expect(css).toMatch(
      /\.document-management-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/u,
    );
    expect(css).toMatch(
      /\.document-management-row > \*,[\s\S]*?\.document-management-heading > \* \{[^}]*min-width: 0;[^}]*max-width: 100%/u,
    );
    expect(css).toMatch(
      /\.document-management-content \{[^}]*grid-template-columns: minmax\(0, 1fr\)[^}]*min-width: 0/u,
    );
    expect(css).toMatch(
      /\.document-management-heading \{[^}]*grid-template-columns: auto minmax\(0, 1fr\)[^}]*min-width: 0/u,
    );
    expect(css).toMatch(
      /\.proposal-review-input \{[^}]*box-sizing: border-box;[^}]*width: 100%;[^}]*min-width: 0;[^}]*max-width: 100%/u,
    );
    expect(css).toMatch(
      /\.filename-inspector-toggle \{[^}]*width: fit-content;[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*min-height: 44px;[^}]*white-space: normal/u,
    );
    expect(css).toMatch(
      /@media \(max-width: 520px\) \{[\s\S]*?\.document-management-row \{[^}]*width: 100%;[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*align-items: stretch[\s\S]*?\.document-management-row > \.button \{[^}]*width: 100%;[^}]*min-width: 0;[^}]*max-width: 100%[\s\S]*?\.proposal-review-actions \{[^}]*display: grid/u,
    );
    expect(css).not.toMatch(
      /@media[^{}]*\{[\s\S]*?\.filename-inspector-toggle \{[^}]*display: none/u,
    );
    expect(css).not.toMatch(/\.app-page \{[^}]*overflow: hidden/u);
  });
});
