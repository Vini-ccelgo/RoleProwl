import "server-only";
import * as mammoth from "mammoth";
import { getDocumentProxy } from "unpdf";
import {
  ApplicationError,
  ExtractionUnsupportedError,
  InvalidResumeDocumentError,
} from "@/core/errors/application-errors";
import type { ResumeFormat } from "@/core/domain/candidate/resume-import";
import { normalizeExtractedResumeText } from "@/core/domain/candidate/resume-text-normalization";
import { assertDocxArchiveIsSafe } from "./inspect-docx-archive";

export const MAX_RESUME_PDF_PAGES = 100;
export const MAX_EXTRACTED_RESUME_CHARACTERS = 1_000_000;
export const MAX_EXTRACTED_RESUME_LINES = 20_000;

export interface ResumeTextExtraction {
  readonly pageCount: number | null;
  readonly text: string;
}

export type ResumeDocumentAcceptance =
  | {
      readonly classification: "VALID_EXTRACTED";
      readonly extraction: ResumeTextExtraction;
    }
  | {
      readonly classification: "VALID_EXTRACTION_UNSUPPORTED";
      readonly error: ExtractionUnsupportedError;
    };

function assertExtractedTextIsBounded(text: string) {
  if (text.length > MAX_EXTRACTED_RESUME_CHARACTERS) {
    throw new ExtractionUnsupportedError(
      "This résumé contains too much extracted text to process safely.",
    );
  }
  let lineCount = 1;
  for (const character of text) {
    if (character !== "\n") continue;
    lineCount += 1;
    if (lineCount > MAX_EXTRACTED_RESUME_LINES) {
      throw new ExtractionUnsupportedError(
        "This résumé contains too many extracted text lines to process safely.",
      );
    }
  }
}

async function extractPdfText(
  bytes: Uint8Array,
): Promise<ResumeTextExtraction> {
  const pdf = await getDocumentProxy(bytes);
  try {
    if (pdf.numPages > MAX_RESUME_PDF_PAGES) {
      throw new ExtractionUnsupportedError(
        `This PDF exceeds the ${MAX_RESUME_PDF_PAGES}-page processing limit.`,
      );
    }

    const pageTexts: string[] = [];
    let extractedCharacters = 0;
    let extractedLines = 1;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const pageText = content.items
          .flatMap((item) =>
            "str" in item ? [item.str + (item.hasEOL ? "\n" : "")] : [],
          )
          .join("");
        extractedCharacters += pageText.length + (pageNumber > 1 ? 1 : 0);
        extractedLines += pageText.match(/\n/gu)?.length ?? 0;
        if (
          extractedCharacters > MAX_EXTRACTED_RESUME_CHARACTERS ||
          extractedLines > MAX_EXTRACTED_RESUME_LINES
        ) {
          throw new ExtractionUnsupportedError(
            "This PDF contains too much extracted text to process safely.",
          );
        }
        pageTexts.push(pageText);
      } finally {
        page.cleanup();
      }
    }

    const text = normalizeExtractedResumeText(pageTexts.join("\n")).trim();
    if (!text) {
      throw new ExtractionUnsupportedError(
        "This PDF has no machine-readable text. OCR is not supported in the alpha.",
      );
    }
    assertExtractedTextIsBounded(text);
    return { text, pageCount: pdf.numPages };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

export async function extractResumeText(
  format: ResumeFormat,
  bytes: Uint8Array,
): Promise<ResumeTextExtraction> {
  try {
    if (format === "PDF") {
      return await extractPdfText(bytes);
    }

    await assertDocxArchiveIsSafe(bytes);
    // Mammoth's raw-text path disables external file access by default.
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = normalizeExtractedResumeText(result.value).trim();
    if (!text) {
      throw new ExtractionUnsupportedError(
        "This DOCX contains no extractable text.",
      );
    }
    assertExtractedTextIsBounded(text);
    return { text, pageCount: null };
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new InvalidResumeDocumentError(
      format === "PDF"
        ? "This file is not a valid PDF."
        : "This file is not a valid DOCX document.",
      error,
    );
  }
}

export async function inspectResumeDocumentForAcceptance(
  format: ResumeFormat,
  bytes: Uint8Array,
): Promise<ResumeDocumentAcceptance> {
  try {
    return {
      classification: "VALID_EXTRACTED",
      extraction: await extractResumeText(format, bytes),
    };
  } catch (error) {
    if (error instanceof ExtractionUnsupportedError) {
      return {
        classification: "VALID_EXTRACTION_UNSUPPORTED",
        error,
      };
    }
    throw error;
  }
}
