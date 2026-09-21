import { createHash, randomUUID } from "node:crypto";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/core/errors/application-errors";
import { normalizeExtractedResumeText } from "./resume-text-normalization";
import {
  PROPOSAL_DESTINATIONS,
  type SupportedProposalFactType,
} from "./proposal-destinations";

export const MAX_RESUME_BYTES = 4 * 1024 * 1024;

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
    throw new ValidationError("The résumé exceeds the 4 MB upload limit.");
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

function proposalTarget(factType: SupportedProposalFactType) {
  return {
    factType,
    targetPath: PROPOSAL_DESTINATIONS[factType].canonicalPath,
  };
}

const SECTION_TARGETS: Record<
  string,
  { factType: SupportedProposalFactType; targetPath: string }
> = {
  EXPERIENCE: proposalTarget("WORK_EXPERIENCE_TEXT"),
  "WORK EXPERIENCE": proposalTarget("WORK_EXPERIENCE_TEXT"),
  "PROFESSIONAL EXPERIENCE": proposalTarget("WORK_EXPERIENCE_TEXT"),
  EMPLOYMENT: proposalTarget("WORK_EXPERIENCE_TEXT"),
  "EMPLOYMENT HISTORY": proposalTarget("WORK_EXPERIENCE_TEXT"),
  "PROFESSIONAL HISTORY": proposalTarget("WORK_EXPERIENCE_TEXT"),
  "WORK HISTORY": proposalTarget("WORK_EXPERIENCE_TEXT"),
  EDUCATION: proposalTarget("EDUCATION_TEXT"),
  "ACADEMIC BACKGROUND": proposalTarget("EDUCATION_TEXT"),
  "EDUCATIONAL BACKGROUND": proposalTarget("EDUCATION_TEXT"),
  "EDUCATION AND TRAINING": proposalTarget("EDUCATION_TEXT"),
  SKILLS: proposalTarget("SKILL_TEXT"),
  "TECHNICAL SKILLS": proposalTarget("SKILL_TEXT"),
  "CORE SKILLS": proposalTarget("SKILL_TEXT"),
  "CORE COMPETENCIES": proposalTarget("SKILL_TEXT"),
  COMPETENCIES: proposalTarget("SKILL_TEXT"),
  PROJECTS: proposalTarget("PROJECT_TEXT"),
  "PERSONAL PROJECTS": proposalTarget("PROJECT_TEXT"),
  "PROFESSIONAL PROJECTS": proposalTarget("PROJECT_TEXT"),
  "PROJECT EXPERIENCE": proposalTarget("PROJECT_TEXT"),
  "PROJECTS AND RESEARCH": proposalTarget("PROJECT_TEXT"),
  CERTIFICATIONS: proposalTarget("CREDENTIAL_TEXT"),
  CERTIFICATES: proposalTarget("CREDENTIAL_TEXT"),
  CREDENTIALS: proposalTarget("CREDENTIAL_TEXT"),
  "LICENSES AND CERTIFICATIONS": proposalTarget("CREDENTIAL_TEXT"),
  "PROFESSIONAL CERTIFICATIONS": proposalTarget("CREDENTIAL_TEXT"),
  LANGUAGES: proposalTarget("LANGUAGE_TEXT"),
  LANGUAGE: proposalTarget("LANGUAGE_TEXT"),
};

const SUBSTANTIAL_RESUME_CHARACTER_COUNT = 400;
const SUBSTANTIAL_RESUME_LINE_COUNT = 8;
const LOW_INTERPRETATION_COVERAGE = 0.15;

function normalizedHeading(line: string) {
  return line.replace(/[:\s]+$/u, "").toUpperCase();
}

export type ResumeInterpretationStatus = "NORMAL_REVIEW" | "INCOMPLETE";

export interface ResumeInterpretationAssessment {
  readonly status: ResumeInterpretationStatus;
  readonly reason:
    | "USEFUL_STRUCTURED_CONTENT"
    | "INSUFFICIENT_EVIDENCE_OF_INCOMPLETE_INTERPRETATION"
    | "CONTACT_ONLY_WITH_SUBSTANTIAL_TEXT"
    | "NO_PROPOSALS_WITH_SUBSTANTIAL_TEXT"
    | "LOW_STRUCTURED_SOURCE_COVERAGE";
}

export function proposeFactsFromResumeText(
  text: string,
): CandidateFactProposalDraft[] {
  const proposals: CandidateFactProposalDraft[] = [];
  const lines = normalizeExtractedResumeText(text)
    .split(/\r?\n/)
    .map((line) => line.trim());
  let activeSection: (typeof SECTION_TARGETS)[string] | undefined;
  let nameCaptured = false;

  const add = (
    factType: SupportedProposalFactType,
    value: string,
    line: string,
    index: number,
    confidence: number,
  ) => {
    const proposedValue = value.trim();
    if (!proposedValue) return;
    const target = proposalTarget(factType);
    if (
      proposals.some(
        (proposal) =>
          proposal.factType === factType &&
          proposal.proposedValue.text === proposedValue,
      )
    )
      return;
    proposals.push({
      ...target,
      confidence,
      proposedValue: { text: proposedValue },
      sourceRegion: { lineStart: index + 1, lineEnd: index + 1, text: line },
    });
  };

  lines.forEach((line, index) => {
    if (!line) return;
    const heading = normalizedHeading(line);
    if (SECTION_TARGETS[heading]) {
      activeSection = SECTION_TARGETS[heading];
      return;
    }
    const email = line.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u)?.[0];
    if (email) add("PROFILE_EMAIL", email, line, index, 0.98);

    if (!activeSection) {
      const phone = line.match(/(?:\+?\d[\d\s().-]{6,}\d)/u)?.[0];
      const phoneDigits = phone?.replace(/\D/gu, "") ?? "";
      if (phone && phoneDigits.length >= 8 && phoneDigits.length <= 15)
        add("PROFILE_PHONE", phone, line, index, 0.94);

      const linkedIn = line.match(
        /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w%./-]+/iu,
      )?.[0];
      if (linkedIn) add("PROFILE_LINKEDIN_URL", linkedIn, line, index, 0.98);

      const urls = line.match(/(?:https?:\/\/|www\.)[^\s,;]+/giu) ?? [];
      for (const url of urls)
        if (!/linkedin\.com/iu.test(url) && !url.includes("@"))
          add("PROFILE_WEBSITE_URL", url, line, index, 0.94);

      const location = line.match(
        /^(?:current\s+)?(?:location|localiza[cç][aã]o|cidade|city)\s*:\s*(.+)$/iu,
      )?.[1];
      if (location) add("PROFILE_LOCATION", location, line, index, 0.92);

      const country = line.match(/^(?:country|pa[ií]s)\s*:\s*(.+)$/iu)?.[1];
      if (country) add("PROFILE_COUNTRY", country, line, index, 0.98);

      const professionalTitle = line.match(
        /^(?:professional\s+title|headline|job\s+title|cargo|t[ií]tulo\s+profissional)\s*:\s*(.+)$/iu,
      )?.[1];
      if (professionalTitle)
        add("PROFILE_PROFESSIONAL_TITLE", professionalTitle, line, index, 0.98);

      const labeledName = line.match(
        /^(?:full\s+name|name|nome)\s*:\s*(.+)$/iu,
      )?.[1];
      const candidateName = labeledName ?? (!nameCaptured ? line : null);
      const normalizedName = candidateName
        ?.normalize("NFKC")
        .replace(/\s+/gu, " ")
        .trim();
      const nameParts = normalizedName?.split(" ") ?? [];
      const looksLikeName =
        nameParts.length >= 2 &&
        nameParts.length <= 6 &&
        /^[\p{L}][\p{L}'’-]*(?: [\p{L}][\p{L}'’-]*)+$/u.test(
          normalizedName ?? "",
        ) &&
        !/\b(?:curriculum|resume|résumé|engineer|engineering|developer|analyst|manager|security|consultant|specialist|architect|director)\b/iu.test(
          normalizedName ?? "",
        ) &&
        !/^candidate name$/iu.test(normalizedName ?? "");
      if (looksLikeName) {
        add(
          "PROFILE_FIRST_NAME",
          nameParts[0]!,
          line,
          index,
          labeledName ? 0.98 : 0.86,
        );
        add(
          "PROFILE_LAST_NAME",
          nameParts.slice(1).join(" "),
          line,
          index,
          labeledName ? 0.98 : 0.86,
        );
        nameCaptured = true;
      }
    }

    if (activeSection) add(activeSection.factType, line, line, index, 0.55);
  });

  return proposals;
}

export function assessResumeInterpretation(
  text: string,
  proposals: readonly CandidateFactProposalDraft[] = proposeFactsFromResumeText(
    text,
  ),
): ResumeInterpretationAssessment {
  const normalizedText = normalizeExtractedResumeText(text);
  const meaningfulLines = normalizedText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const characterCount = normalizedText.replace(/\s/gu, "").length;
  const substantialText =
    characterCount >= SUBSTANTIAL_RESUME_CHARACTER_COUNT &&
    meaningfulLines.length >= SUBSTANTIAL_RESUME_LINE_COUNT;

  if (!substantialText) {
    return {
      status: "NORMAL_REVIEW",
      reason: "INSUFFICIENT_EVIDENCE_OF_INCOMPLETE_INTERPRETATION",
    };
  }

  const structuredProposals = proposals.filter(
    (proposal) => !proposal.factType.startsWith("PROFILE_"),
  );
  if (structuredProposals.length === 0) {
    return {
      status: "INCOMPLETE",
      reason:
        proposals.length === 0
          ? "NO_PROPOSALS_WITH_SUBSTANTIAL_TEXT"
          : "CONTACT_ONLY_WITH_SUBSTANTIAL_TEXT",
    };
  }

  const supportedSourceCharacters = new Map(
    proposals.map((proposal) => [
      proposal.sourceRegion.lineStart,
      proposal.sourceRegion.text.replace(/\s/gu, "").length,
    ]),
  );
  const sourceCoverage =
    [...supportedSourceCharacters.values()].reduce(
      (total, count) => total + count,
      0,
    ) / characterCount;
  const structuredDestinations = new Set(
    structuredProposals.map((proposal) => proposal.factType),
  );
  if (
    structuredDestinations.size === 1 &&
    sourceCoverage < LOW_INTERPRETATION_COVERAGE
  ) {
    return {
      status: "INCOMPLETE",
      reason: "LOW_STRUCTURED_SOURCE_COVERAGE",
    };
  }

  return { status: "NORMAL_REVIEW", reason: "USEFUL_STRUCTURED_CONTENT" };
}
