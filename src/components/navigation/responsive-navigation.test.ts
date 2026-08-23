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
});
