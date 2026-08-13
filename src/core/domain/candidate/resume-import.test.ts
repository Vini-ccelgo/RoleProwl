import { describe, expect, it } from "vitest";
import {
  MAX_RESUME_BYTES,
  assertResumeIsNotDuplicate,
  proposeFactsFromResumeText,
  requireOwnedCandidateDocument,
  validateResumeUpload,
} from "./resume-import";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe("resume upload validation", () => {
  it("accepts matching PDF and DOCX signatures", () => {
    expect(
      validateResumeUpload({
        bytes: PDF_BYTES,
        fileName: "resume.pdf",
        mimeType: "application/pdf",
      }).format,
    ).toBe("PDF");
    expect(
      validateResumeUpload({
        bytes: DOCX_BYTES,
        fileName: "resume.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }).format,
    ).toBe("DOCX");
  });

  it.each([
    ["empty", new Uint8Array(), "resume.pdf", "application/pdf"],
    ["incorrect MIME", PDF_BYTES, "resume.pdf", "text/plain"],
    ["mismatched extension", PDF_BYTES, "resume.docx", "application/pdf"],
    ["incorrect signature", DOCX_BYTES, "resume.pdf", "application/pdf"],
  ])("rejects %s uploads", (_name, bytes, fileName, mimeType) => {
    expect(() => validateResumeUpload({ bytes, fileName, mimeType })).toThrow();
  });

  it("rejects oversized uploads", () => {
    expect(() =>
      validateResumeUpload({
        bytes: new Uint8Array(MAX_RESUME_BYTES + 1),
        fileName: "resume.pdf",
        mimeType: "application/pdf",
      }),
    ).toThrow("5 MB");
  });

  it("rejects duplicates and conceals foreign documents", () => {
    expect(() => assertResumeIsNotDuplicate("existing-id")).toThrow(
      "already been uploaded",
    );
    expect(() =>
      requireOwnedCandidateDocument({ userId: "other-user" }, "user-1"),
    ).toThrow("not found");
  });
});

describe("resume proposal parsing", () => {
  it("preserves source lines and creates only proposal drafts", () => {
    const drafts = proposeFactsFromResumeText(
      "candidate@example.test\n\nSKILLS\nTypeScript\nPostgreSQL",
    );
    expect(drafts).toEqual([
      expect.objectContaining({
        factType: "PROFILE_EMAIL",
        proposedValue: { text: "candidate@example.test" },
        sourceRegion: expect.objectContaining({ lineStart: 1 }),
      }),
      expect.objectContaining({
        factType: "SKILL_TEXT",
        proposedValue: { text: "TypeScript" },
      }),
      expect.objectContaining({
        factType: "SKILL_TEXT",
        proposedValue: { text: "PostgreSQL" },
      }),
    ]);
  });
});
