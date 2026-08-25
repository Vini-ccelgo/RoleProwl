import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("responsive navigation contract", () => {
  it("shows the menu as soon as desktop navigation is hidden", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const intermediate = css.match(
      /@media \(max-width: 1200px\) \{([\s\S]*?)\n\}/u,
    )?.[1];
    expect(intermediate).toContain(".desktop-nav");
    expect(intermediate).toContain("display: none");
    expect(intermediate).toContain(".mobile-actions");
    expect(intermediate).toContain("display: flex");
  });

  it("uses an authenticated Workspace action and aligns the narrow group", () => {
    const navigation = readFileSync(
      "src/components/navigation/auth-navigation.tsx",
      "utf8",
    );
    const header = readFileSync(
      "src/components/layout/marketing-header.tsx",
      "utf8",
    );
    const css = readFileSync("src/app/globals.css", "utf8");
    const narrow = css.match(
      /@media \(max-width: 768px\) \{([\s\S]*?)\n\}/u,
    )?.[1];

    expect(navigation).toContain('when="signed-out"');
    expect(navigation).toContain("Get Started");
    expect(navigation).toContain('when="signed-in"');
    expect(navigation).toContain('href="/dashboard"');
    expect(navigation).toContain("Workspace");
    expect(header).toContain("<MobileAuthNavigation");
    expect(header).toContain("workspaceAvailable={workspaceAvailable}");
    expect(narrow).toMatch(/\.mobile-actions \{[\s\S]*?margin-left: auto/u);
  });
});
