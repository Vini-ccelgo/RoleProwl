import { createHash, randomUUID } from "node:crypto";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/core/errors/application-errors";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export type ResumeFormat = "PDF" | "DOCX";

export interface ValidatedResume {
  readonly bytes: Uint8Array;
  readonly contentHash: string;
  readonly format: ResumeFormat;
  readonly mimeType: string;
  readonly originalFileName: string;
  readonly sizeBytes: number;
  readonly storageKey: string;
}

const FORMAT_RULES = {
  PDF: {
    extension: ".pdf",
    mimeType: "application/pdf",
    signature: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  DOCX: {
    extension: ".docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: [0x50, 0x4b],
  },
} as const;

function hasSignature(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function validateResumeUpload(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  maximumBytes?: number;
}): ValidatedResume {
  const { bytes, mimeType } = input;
  const originalFileName = input.fileName.trim();
  const maximumBytes = input.maximumBytes ?? MAX_RESUME_BYTES;

  if (!originalFileName || bytes.byteLength === 0) {
    throw new ValidationError("Choose a non-empty PDF or DOCX résumé.");
  }
  if (bytes.byteLength > maximumBytes) {
    throw new ValidationError("The résumé exceeds the 5 MB upload limit.");
  }

  const format = (Object.keys(FORMAT_RULES) as ResumeFormat[]).find(
    (candidate) =>
      originalFileName
        .toLowerCase()
        .endsWith(FORMAT_RULES[candidate].extension) &&
      mimeType === FORMAT_RULES[candidate].mimeType,
  );
  if (!format) {
    throw new ValidationError(
      "File name and MIME type must consistently identify a PDF or DOCX document.",
    );
  }
  if (!hasSignature(bytes, FORMAT_RULES[format].signature)) {
    throw new ValidationError(
      "The file contents do not match the declared résumé format.",
    );
  }

  return {
    bytes,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    format,
    mimeType,
    originalFileName,
    sizeBytes: bytes.byteLength,
    storageKey: `candidate-documents/${randomUUID()}`,
  };
}

export function assertResumeIsNotDuplicate(existingDocumentId: string | null) {
  if (existingDocumentId) {
    throw new ConflictError("This résumé has already been uploaded.");
  }
}

export function requireOwnedCandidateDocument<T extends { userId: string }>(
  document: T | null,
  userId: string,
): T {
  if (!document || document.userId !== userId) throw new NotFoundError();
  return document;
}

export interface CandidateFactProposalDraft {
  readonly confidence: number;
  readonly factType: string;
  readonly proposedValue: { readonly text: string };
  readonly sourceRegion: {
    readonly lineEnd: number;
    readonly lineStart: number;
    readonly text: string;
  };
  readonly targetPath: string;
}

const SECTION_TARGETS: Record<
  string,
  { factType: string; targetPath: string }
> = {
  EXPERIENCE: {
    factType: "WORK_EXPERIENCE_TEXT",
    targetPath: "workExperiences",
  },
  EMPLOYMENT: {
    factType: "WORK_EXPERIENCE_TEXT",
    targetPath: "workExperiences",
  },
  EDUCATION: { factType: "EDUCATION_TEXT", targetPath: "educationRecords" },
  SKILLS: { factType: "SKILL_TEXT", targetPath: "skills" },
  PROJECTS: { factType: "PROJECT_TEXT", targetPath: "projects" },
  CERTIFICATIONS: { factType: "CREDENTIAL_TEXT", targetPath: "credentials" },
  CREDENTIALS: { factType: "CREDENTIAL_TEXT", targetPath: "credentials" },
};

export function proposeFactsFromResumeText(
  text: string,
): CandidateFactProposalDraft[] {
  const proposals: CandidateFactProposalDraft[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  let activeSection: (typeof SECTION_TARGETS)[string] | undefined;

  lines.forEach((line, index) => {
    if (!line) return;
    const heading = line.replace(/[:\s]+$/u, "").toUpperCase();
    if (SECTION_TARGETS[heading]) {
      activeSection = SECTION_TARGETS[heading];
      return;
    }
    const email = line.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u)?.[0];
    const fact = email
      ? { factType: "PROFILE_EMAIL", targetPath: "candidateProfile.email" }
      : activeSection;
    if (!fact) return;
    proposals.push({
      ...fact,
      confidence: email ? 0.98 : 0.55,
      proposedValue: { text: email ?? line },
      sourceRegion: { lineStart: index + 1, lineEnd: index + 1, text: line },
    });
  });

  return proposals;
}
