import { describe, expect, it } from "vitest";
import {
  MAX_RESUME_BYTES,
  assessResumeInterpretation,
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
        targetPath: "candidateFacts.profileEmails",
        proposedValue: { text: "candidate@example.test" },
        sourceRegion: expect.objectContaining({ lineStart: 1 }),
      }),
      expect.objectContaining({
        factType: "SKILL_TEXT",
        targetPath: "candidateFacts.skills",
        proposedValue: { text: "TypeScript" },
      }),
      expect.objectContaining({
        factType: "SKILL_TEXT",
        targetPath: "candidateFacts.skills",
        proposedValue: { text: "PostgreSQL" },
      }),
    ]);
  });

  it("normalizes symbol-font list markers without stripping leading letters", () => {
    const drafts = proposeFactsFromResumeText(
      "SKILLS\nl Leadership\nl Linux\nl lifecycle automation",
    );
    expect(drafts.map((draft) => draft.proposedValue.text)).toEqual([
      "Leadership",
      "Linux",
      "lifecycle automation",
    ]);
    expect(drafts.map((draft) => draft.sourceRegion.lineStart)).toEqual([
      2, 3, 4,
    ]);
  });

  it.each([
    ["EXPERIENCE", "WORK_EXPERIENCE_TEXT"],
    ["WORK EXPERIENCE", "WORK_EXPERIENCE_TEXT"],
    ["PROFESSIONAL EXPERIENCE", "WORK_EXPERIENCE_TEXT"],
    ["EMPLOYMENT", "WORK_EXPERIENCE_TEXT"],
    ["EMPLOYMENT HISTORY", "WORK_EXPERIENCE_TEXT"],
    ["PROFESSIONAL HISTORY", "WORK_EXPERIENCE_TEXT"],
    ["WORK HISTORY", "WORK_EXPERIENCE_TEXT"],
    ["EDUCATION", "EDUCATION_TEXT"],
    ["ACADEMIC BACKGROUND", "EDUCATION_TEXT"],
    ["EDUCATIONAL BACKGROUND", "EDUCATION_TEXT"],
    ["EDUCATION AND TRAINING", "EDUCATION_TEXT"],
    ["SKILLS", "SKILL_TEXT"],
    ["TECHNICAL SKILLS", "SKILL_TEXT"],
    ["CORE SKILLS", "SKILL_TEXT"],
    ["CORE COMPETENCIES", "SKILL_TEXT"],
    ["COMPETENCIES", "SKILL_TEXT"],
    ["PROJECTS", "PROJECT_TEXT"],
    ["PERSONAL PROJECTS", "PROJECT_TEXT"],
    ["PROFESSIONAL PROJECTS", "PROJECT_TEXT"],
    ["PROJECT EXPERIENCE", "PROJECT_TEXT"],
    ["PROJECTS AND RESEARCH", "PROJECT_TEXT"],
    ["CERTIFICATIONS", "CREDENTIAL_TEXT"],
    ["CERTIFICATES", "CREDENTIAL_TEXT"],
    ["CREDENTIALS", "CREDENTIAL_TEXT"],
    ["LICENSES AND CERTIFICATIONS", "CREDENTIAL_TEXT"],
    ["PROFESSIONAL CERTIFICATIONS", "CREDENTIAL_TEXT"],
  ])("maps the %s heading to %s", (heading, factType) => {
    const [draft] = proposeFactsFromResumeText(
      `${heading.toLocaleLowerCase("en-US")}:\nExact source line`,
    );
    expect(draft).toMatchObject({
      factType,
      proposedValue: { text: "Exact source line" },
      sourceRegion: { lineStart: 2, lineEnd: 2, text: "Exact source line" },
    });
  });

  it("keeps pre-section prose unknown and recognizes email independently", () => {
    const drafts = proposeFactsFromResumeText(
      [
        "Candidate Name",
        "I bring experience across operations and skills development.",
        "candidate@example.test",
        "Technical Skills",
        "l TypeScript",
      ].join("\n"),
    );

    expect(drafts.map((draft) => draft.proposedValue.text)).toEqual([
      "candidate@example.test",
      "TypeScript",
    ]);
    expect(drafts[0].factType).toBe("PROFILE_EMAIL");
    expect(drafts[1].factType).toBe("SKILL_TEXT");
  });

  it("does not fuzzy-match prose containing heading words", () => {
    expect(
      proposeFactsFromResumeText(
        "Experience helps build skills, but this sentence is not a heading.",
      ),
    ).toEqual([]);
  });
});

describe("resume interpretation quality", () => {
  const substantialPreamble = Array.from(
    { length: 9 },
    (_, index) =>
      `Unclassified résumé line ${index + 1} with substantial grounded source wording that remains unknown.`,
  );

  it("flags substantial contact-only extraction without calling extraction a failure", () => {
    const text = ["candidate@example.test", ...substantialPreamble].join("\n");
    expect(assessResumeInterpretation(text)).toEqual({
      status: "INCOMPLETE",
      reason: "CONTACT_ONLY_WITH_SUBSTANTIAL_TEXT",
    });
  });

  it("flags low structured-source coverage using volume and coverage together", () => {
    const text = [
      ...substantialPreamble,
      "Technical Skills",
      "TypeScript",
    ].join("\n");
    expect(assessResumeInterpretation(text)).toEqual({
      status: "INCOMPLETE",
      reason: "LOW_STRUCTURED_SOURCE_COVERAGE",
    });
  });

  it("does not classify a legitimately small document as incomplete from count alone", () => {
    expect(
      assessResumeInterpretation("candidate@example.test\nBrief profile"),
    ).toEqual({
      status: "NORMAL_REVIEW",
      reason: "INSUFFICIENT_EVIDENCE_OF_INCOMPLETE_INTERPRETATION",
    });
  });

  it("accepts substantial text with grounded coverage across canonical sections", () => {
    const text = [
      "Professional Experience",
      ...substantialPreamble.slice(0, 4),
      "Technical Skills",
      ...substantialPreamble.slice(4, 7),
      "Academic Background",
      ...substantialPreamble.slice(7),
    ].join("\n");
    expect(assessResumeInterpretation(text)).toEqual({
      status: "NORMAL_REVIEW",
      reason: "USEFUL_STRUCTURED_CONTENT",
    });
  });
});
