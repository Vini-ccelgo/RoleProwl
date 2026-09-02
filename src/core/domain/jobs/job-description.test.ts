import { describe, expect, it } from "vitest";
import { readableJobDescription } from "./job-description";

describe("readable job descriptions", () => {
  it("preserves plain text", () => {
    expect(
      readableJobDescription("Build secure systems.\nWork with teams."),
    ).toBe("Build secure systems.\nWork with teams.");
  });

  it("keeps paragraphs and lists readable", () => {
    expect(
      readableJobDescription(
        "<h2>Responsibilities</h2><p>Protect systems.</p><ul><li>Monitor alerts</li><li>Investigate incidents</li></ul>",
      ),
    ).toBe(
      "Responsibilities\nProtect systems.\n• Monitor alerts\n• Investigate incidents",
    );
  });

  it("decodes ordinary and double-escaped entities", () => {
    expect(
      readableJobDescription(
        "Security &amp;amp; Risk &mdash; use &lt;strong&gt;care&lt;/strong&gt;.",
      ),
    ).toBe("Security & Risk — use care.");
  });

  it("normalizes common encoded bullet markers", () => {
    expect(readableJobDescription("Requirements<br>&bull; Python")).toBe(
      "Requirements\n• Python",
    );
  });

  it("removes scripts, event handlers, embeds, and remote tracking images", () => {
    const value = readableJobDescription(
      '<p onclick="steal()">Safe role</p><script>alert(1)</script><img src="https://tracker.test/pixel"><iframe src="https://tracker.test"></iframe>',
    );
    expect(value).toBe("Safe role");
    expect(value).not.toMatch(/script|onclick|tracker|alert/iu);
  });

  it("removes executable markup that was entity encoded", () => {
    expect(
      readableJobDescription(
        "&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;<p>Readable</p>",
      ),
    ).toBe("Readable");
  });
});
