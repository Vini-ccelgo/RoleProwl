import "server-only";
import * as mammoth from "mammoth";
import { extractText } from "unpdf";
import { ExtractionUnsupportedError } from "@/core/errors/application-errors";
import type { ResumeFormat } from "@/core/domain/candidate/resume-import";
import { normalizeExtractedResumeText } from "@/core/domain/candidate/resume-text-normalization";

export interface ResumeTextExtraction {
  readonly pageCount: number | null;
  readonly text: string;
}

export async function extractResumeText(
  format: ResumeFormat,
  bytes: Uint8Array,
): Promise<ResumeTextExtraction> {
  try {
    if (format === "PDF") {
      const result = await extractText(bytes, { mergePages: true });
      const text = normalizeExtractedResumeText(result.text).trim();
      if (!text) {
        throw new ExtractionUnsupportedError(
          "This PDF has no machine-readable text. OCR is not supported in the alpha.",
        );
      }
      return { text, pageCount: result.totalPages };
    }

    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = normalizeExtractedResumeText(result.value).trim();
    if (!text) {
      throw new ExtractionUnsupportedError(
        "This DOCX contains no extractable text.",
      );
    }
    return { text, pageCount: null };
  } catch (error) {
    if (error instanceof ExtractionUnsupportedError) throw error;
    throw new ExtractionUnsupportedError(
      `RoleProwl could not extract this ${format}. Confirm that it is a valid, unencrypted document with selectable text.`,
      error,
    );
  }
}
