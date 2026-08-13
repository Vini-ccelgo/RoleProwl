import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { extractResumeText } from "./extract-resume-text";

async function syntheticPdf(text: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  page.drawText(text, { x: 72, y: 720, font, size: 12 });
  return pdf.save();
}

async function syntheticDocx(text: string) {
  const document = new Document({
    sections: [{ children: [new Paragraph(text)] }],
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
