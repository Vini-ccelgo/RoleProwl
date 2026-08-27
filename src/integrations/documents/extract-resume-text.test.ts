import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { extractResumeText } from "./extract-resume-text";

async function syntheticPdf(...lines: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  lines.forEach((line, index) =>
    page.drawText(line, {
      x: index % 2 === 0 ? 72 : 84,
      y: 720 - index * 24,
      font,
      size: 12,
    }),
  );
  return pdf.save();
}

async function syntheticDocx(...paragraphs: string[]) {
  const document = new Document({
    sections: [{ children: paragraphs.map((text) => new Paragraph(text)) }],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

describe("resume text extraction", () => {
  it("extracts text from a valid synthetic PDF", async () => {
    const result = await extractResumeText(
      "PDF",
      await syntheticPdf("Synthetic Product Manager"),
    );
    expect(result.text).toContain("Synthetic Product Manager");
    expect(result.pageCount).toBe(1);
  });

  it("extracts text from a valid synthetic DOCX", async () => {
    const result = await extractResumeText(
      "DOCX",
      await syntheticDocx("Synthetic Operations Lead"),
    );
    expect(result.text).toContain("Synthetic Operations Lead");
  });

  it("preserves separately positioned PDF lines for deterministic parsing", async () => {
    const result = await extractResumeText(
      "PDF",
      await syntheticPdf(
        "candidate@example.test",
        "Professional Experience",
        "Built deterministic ingestion",
        "Technical Skills",
        "TypeScript",
      ),
    );
    expect(result.text.split(/\r?\n/u)).toEqual(
      expect.arrayContaining([
        "candidate@example.test",
        "Professional Experience",
        "Built deterministic ingestion",
        "Technical Skills",
        "TypeScript",
      ]),
    );
  });

  it("preserves multiple DOCX heading and content paragraphs", async () => {
    const result = await extractResumeText(
      "DOCX",
      await syntheticDocx(
        "Professional Experience",
        "Built deterministic ingestion",
        "Technical Skills",
        "TypeScript",
      ),
    );
    expect(result.text.split(/\r?\n/u).filter(Boolean)).toEqual([
      "Professional Experience",
      "Built deterministic ingestion",
      "Technical Skills",
      "TypeScript",
    ]);
  });

  it.each(["PDF", "DOCX"] as const)(
    "returns an actionable unsupported error for malformed %s content",
    async (format) => {
      await expect(
        extractResumeText(format, new Uint8Array([1, 2, 3, 4])),
      ).rejects.toMatchObject({ code: "EXTRACTION_UNSUPPORTED" });
    },
  );

  it("rejects a valid but text-empty PDF without invoking OCR", async () => {
    await expect(
      extractResumeText("PDF", await syntheticPdf("")),
    ).rejects.toThrow("no machine-readable text");
  });
});
