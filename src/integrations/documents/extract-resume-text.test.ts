import { Document, Packer, Paragraph } from "docx";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  MAX_RESUME_PDF_PAGES,
  extractResumeText,
  inspectResumeDocumentForAcceptance,
} from "./extract-resume-text";
import {
  MAX_DOCX_ARCHIVE_ENTRIES,
  MAX_DOCX_XML_ENTRY_BYTES,
} from "./inspect-docx-archive";

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

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

async function syntheticZipDocx(documentText: string, extraEntries = 0) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", DOCX_CONTENT_TYPES);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>${documentText}</w:t></w:r></w:p></w:body>
      </w:document>`,
  );
  for (let index = 0; index < extraEntries; index += 1) {
    zip.file(`custom/item-${index}.txt`, "x");
  }
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

function falsifyZipEntryUncompressedSize(
  bytes: Uint8Array,
  fileName: string,
  declaredSize: number,
) {
  const patched = Buffer.from(bytes);
  const nameBytes = Buffer.from(fileName);
  let centralOffset = patched.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  let patchedCentralEntry = false;
  while (centralOffset >= 0) {
    const nameLength = patched.readUInt16LE(centralOffset + 28);
    const extraLength = patched.readUInt16LE(centralOffset + 30);
    const commentLength = patched.readUInt16LE(centralOffset + 32);
    const entryName = patched.subarray(
      centralOffset + 46,
      centralOffset + 46 + nameLength,
    );
    if (entryName.equals(nameBytes)) {
      patched.writeUInt32LE(declaredSize, centralOffset + 24);
      patchedCentralEntry = true;
      break;
    }
    centralOffset = patched.indexOf(
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      centralOffset + 46 + nameLength + extraLength + commentLength,
    );
  }

  let localOffset = patched.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  let patchedLocalEntry = false;
  while (localOffset >= 0) {
    const nameLength = patched.readUInt16LE(localOffset + 26);
    const extraLength = patched.readUInt16LE(localOffset + 28);
    const entryName = patched.subarray(
      localOffset + 30,
      localOffset + 30 + nameLength,
    );
    if (entryName.equals(nameBytes)) {
      patched.writeUInt32LE(declaredSize, localOffset + 22);
      patchedLocalEntry = true;
      break;
    }
    const compressedSize = patched.readUInt32LE(localOffset + 18);
    localOffset = patched.indexOf(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      localOffset + 30 + nameLength + extraLength + compressedSize,
    );
  }

  if (!patchedCentralEntry || !patchedLocalEntry) {
    throw new Error(`Could not patch ZIP entry ${fileName}`);
  }
  return new Uint8Array(patched);
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
    "classifies malformed %s content as an invalid document",
    async (format) => {
      await expect(
        extractResumeText(format, new Uint8Array([1, 2, 3, 4])),
      ).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
    },
  );

  it("keeps a valid but text-empty PDF distinct from an invalid PDF", async () => {
    await expect(
      inspectResumeDocumentForAcceptance("PDF", await syntheticPdf("")),
    ).resolves.toMatchObject({
      classification: "VALID_EXTRACTION_UNSUPPORTED",
      error: { code: "EXTRACTION_UNSUPPORTED" },
    });
  });

  it("rejects a PDF before extraction when its page count exceeds the limit", async () => {
    const pdf = await PDFDocument.create();
    for (let index = 0; index <= MAX_RESUME_PDF_PAGES; index += 1) {
      pdf.addPage([612, 792]);
    }

    await expect(extractResumeText("PDF", await pdf.save())).rejects.toThrow(
      `${MAX_RESUME_PDF_PAGES}-page`,
    );
  });

  it("rejects a highly compressed DOCX before Mammoth expands its document XML", async () => {
    const bomb = await syntheticZipDocx(
      "A".repeat(MAX_DOCX_XML_ENTRY_BYTES + 1),
    );

    expect(bomb.byteLength).toBeLessThan(20_000);
    await expect(extractResumeText("DOCX", bomb)).rejects.toMatchObject({
      cause: { message: expect.stringContaining("safe document-processing") },
      code: "INVALID_DOCUMENT",
    });
  });

  it("rejects an arbitrary ZIP archive that merely has a DOCX signature", async () => {
    const zip = new JSZip();
    zip.file("not-a-document.txt", "synthetic");
    const archive = await zip.generateAsync({ type: "uint8array" });

    await expect(extractResumeText("DOCX", archive)).rejects.toThrow(
      "not a valid DOCX document",
    );
  });

  it("rejects DOCX archives that exceed the bounded entry count", async () => {
    const archive = await syntheticZipDocx(
      "Synthetic Security Engineer",
      MAX_DOCX_ARCHIVE_ENTRIES,
    );

    await expect(extractResumeText("DOCX", archive)).rejects.toMatchObject({
      cause: { message: expect.stringContaining("too many archive entries") },
      code: "INVALID_DOCUMENT",
    });
  });

  it("rejects compressed data whose actual expansion exceeds falsified metadata", async () => {
    const archive = await syntheticZipDocx(
      "A".repeat(MAX_DOCX_XML_ENTRY_BYTES + 1),
    );
    const falsified = falsifyZipEntryUncompressedSize(
      archive,
      "word/document.xml",
      100,
    );

    await expect(extractResumeText("DOCX", falsified)).rejects.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
  });
});
