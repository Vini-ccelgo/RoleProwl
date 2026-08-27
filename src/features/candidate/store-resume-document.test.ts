import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type {
  ObjectStorageProvider,
  StoredObject,
} from "@/core/contracts/object-storage-provider";
import {
  proposeFactsFromResumeText,
  validateResumeUpload,
} from "@/core/domain/candidate/resume-import";
import { extractResumeText } from "@/integrations/documents/extract-resume-text";
import { storeAndRetrieveResume } from "./store-resume-document";

class MemoryStorage implements ObjectStorageProvider {
  readonly objects = new Map<string, Uint8Array>();

  async put(
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<StoredObject> {
    this.objects.set(key, new Uint8Array(data));
    return { key, contentType, size: data.byteLength };
  }

  async get(key: string) {
    const value = this.objects.get(key);
    return value ? new Uint8Array(value) : null;
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

async function syntheticPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  [
    "synthetic@example.test",
    "PROFESSIONAL EXPERIENCE",
    "Built reliable ingestion",
    "TECHNICAL SKILLS",
    "TypeScript",
  ].forEach((line, index) =>
    page.drawText(line, {
      x: index % 2 === 0 ? 72 : 84,
      y: 720 - index * 24,
      font,
      size: 12,
    }),
  );
  return pdf.save();
}

async function syntheticDocx() {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph("synthetic@example.test"),
          new Paragraph("PROFESSIONAL EXPERIENCE"),
          new Paragraph("Built reliable ingestion"),
          new Paragraph("TECHNICAL SKILLS"),
          new Paragraph("Incident response"),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

describe.each([
  {
    format: "PDF" as const,
    fileName: "synthetic-resume.pdf",
    mimeType: "application/pdf",
    bytes: syntheticPdf,
  },
  {
    format: "DOCX" as const,
    fileName: "synthetic-resume.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: syntheticDocx,
  },
])("stored résumé ingestion ($format)", (fixture) => {
  it("persists, retrieves, extracts, and reaches the proposal boundary", async () => {
    const originalBytes = new Uint8Array(await fixture.bytes());
    const validated = validateResumeUpload({
      bytes: originalBytes,
      fileName: fixture.fileName,
      mimeType: fixture.mimeType,
    });
    const storage = new MemoryStorage();
    const stages: string[] = [];

    const retrieved = await storeAndRetrieveResume(
      storage,
      validated,
      (stage) => stages.push(stage),
    );
    expect(retrieved).toEqual(originalBytes);
    const extraction = await extractResumeText(fixture.format, retrieved);
    const proposals = proposeFactsFromResumeText(extraction.text);

    expect(stages).toEqual(["storage_write", "storage_retrieval"]);
    expect(extraction.text).toContain("synthetic@example.test");
    expect(proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factType: "PROFILE_EMAIL" }),
        expect.objectContaining({ factType: "WORK_EXPERIENCE_TEXT" }),
        expect.objectContaining({ factType: "SKILL_TEXT" }),
      ]),
    );
  });
});

it("rejects storage corruption before document parsing", async () => {
  const bytes = new Uint8Array(await syntheticPdf());
  const validated = validateResumeUpload({
    bytes,
    fileName: "synthetic-resume.pdf",
    mimeType: "application/pdf",
  });
  const storage = new MemoryStorage();
  storage.get = async () => new Uint8Array([1, 2, 3]);

  await expect(
    storeAndRetrieveResume(storage, validated),
  ).rejects.toMatchObject({
    code: "INTEGRATION",
    message: "The stored document failed the extraction integrity check.",
  });
});
