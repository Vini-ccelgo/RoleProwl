import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("onboarding mobile layout contract", () => {
  it("uses the centered bounded app container and dynamic viewport sizing", () => {
    const page = readFileSync("src/app/(app)/onboarding/page.tsx", "utf8");
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(page).toContain('className="app-page grid gap-7"');
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

  it("constrains filename rows without hiding legitimate page scrolling", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toMatch(
      /\.safe-filename \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-wrap: anywhere/u,
    );
    expect(css).toMatch(
      /\.document-management-row \{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto/u,
    );
    expect(css).not.toMatch(/\.app-page \{[^}]*overflow: hidden/u);
  });
});
