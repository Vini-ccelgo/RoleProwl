import { describe, expect, it } from "vitest";
import { normalizeExtractedResumeText } from "./resume-text-normalization";

describe("extracted résumé text normalization", () => {
  it("removes standalone lowercase-l symbol-font list markers", () => {
    expect(
      normalizeExtractedResumeText(
        "EXPERIENCE\nl Led incident response\n  l\tBuilt detection tooling",
      ),
    ).toBe("EXPERIENCE\nLed incident response\n  Built detection tooling");
  });

  it("preserves legitimate words beginning with l", () => {
    const text = [
      "Leadership and mentoring",
      "Linux administration",
      "lifecycle automation",
      "l-shaped migration plan",
      "Lowercase and uppercase letters",
    ].join("\n");
    expect(normalizeExtractedResumeText(text)).toBe(text);
  });

  it("preserves line boundaries and is idempotent", () => {
    const text = "SKILLS\r\nl TypeScript\r\nl PostgreSQL";
    const normalized = normalizeExtractedResumeText(text);
    expect(normalized).toBe("SKILLS\r\nTypeScript\r\nPostgreSQL");
    expect(normalizeExtractedResumeText(normalized)).toBe(normalized);
  });
});
