import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PROFILE_SECTIONS,
  ProfileSectionNavigation,
} from "./profile-section-navigation";
import { confirmFactRemoval } from "./confirm-fact-removal-button";

describe("RP-032A profile and form contracts", () => {
  it("preserves section order and offers a compact select without a scroll strip", () => {
    const markup = renderToStaticMarkup(
      createElement(ProfileSectionNavigation),
    );
    let previousIndex = -1;

    for (const section of PROFILE_SECTIONS) {
      const sectionIndex = markup.indexOf(`href="#${section.id}"`);
      expect(sectionIndex).toBeGreaterThan(previousIndex);
      previousIndex = sectionIndex;
    }

    expect(markup).toContain('aria-label="Career Profile section"');
    expect(markup).toContain('aria-current="location"');

    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("grid-template-columns: 260px minmax(0, 1fr)");
    expect(css).toMatch(/\.app-main \{[\s\S]*?min-width: 0/u);
    expect(css).toMatch(/\.vault-jump-nav \{[\s\S]*?flex-wrap: wrap/u);
    expect(css).not.toMatch(/\.vault-jump-nav \{[\s\S]*?overflow-x: auto/u);
    expect(css).toMatch(
      /@media \(max-width: 1000px\) \{[\s\S]*?\.vault-jump-nav-desktop \{[\s\S]*?display: none[\s\S]*?\.vault-jump-select \{[\s\S]*?display: grid/u,
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\) \{[\s\S]*?\.app-frame \{[\s\S]*?display: block/u,
    );
  });

  it("keeps the verified badge intact and separates the destructive action", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toMatch(
      /\.verified-fact-badge \{[\s\S]*?flex: 0 0 auto;[\s\S]*?white-space: nowrap/u,
    );
    expect(css).toMatch(
      /\.verified-fact-remove \{[\s\S]*?border-top: 1px solid var\(--border\)/u,
    );
    expect(css).toMatch(/\.record-delete \{[\s\S]*?min-height: 44px/u);

    const deny = vi.fn(() => false);
    const allow = vi.fn(() => true);
    expect(confirmFactRemoval(deny)).toBe(false);
    expect(confirmFactRemoval(allow)).toBe(true);
    expect(deny).toHaveBeenCalledWith(
      expect.stringContaining("Remove this verified résumé fact"),
    );
  });

  it("uses theme-aware proposal inputs in light and dark mode", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toContain("--input-background: var(--surface)");
    expect(css).toContain("--input-foreground: var(--foreground)");
    expect(css).toMatch(
      /\.proposal-review-input \{[\s\S]*?background: var\(--input-background\);[\s\S]*?color: var\(--input-foreground\)/u,
    );
    expect(css).toMatch(
      /\.proposal-review-input:disabled \{[\s\S]*?background: var\(--input-disabled-background\)/u,
    );
    expect(css).toContain(".proposal-review-input:-webkit-autofill");
    expect(css).not.toContain("proposal-review-input bg-white");
  });

  it("keeps account identity distinct and uses neutral authenticated Home copy", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const settings = readFileSync("src/app/(app)/settings/page.tsx", "utf8");
    const home = readFileSync("src/app/(marketing)/page.tsx", "utf8");

    expect(layout).toContain('account: "Account identity"');
    expect(settings).toContain("sessions under Account identity");
    expect(settings).toContain("RoleProwl candidate profile");
    expect(settings).toContain("under Career Profile");
    expect(home).toContain("What’s next");
    expect(home).not.toContain("Your next useful action");
  });
});
