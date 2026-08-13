import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { DocxResumeRenderer } from "./docx-resume-renderer";

describe("DocxResumeRenderer", () => {
  it("creates a valid usable DOCX containing the structured resume", async () => {
    const bytes = await new DocxResumeRenderer().render({
      headline: "Platform Engineer",
      summary: "Grounded professional summary.",
      sections: [
        { heading: "Experience", bullets: ["Built a verified system."] },
      ],
    });
    expect([...bytes.slice(0, 4)]).toEqual([80, 75, 3, 4]);
    const extracted = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    expect(extracted.value).toContain("Platform Engineer");
    expect(extracted.value).toContain("Built a verified system.");
  });
});
