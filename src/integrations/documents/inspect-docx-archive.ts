import { Buffer } from "node:buffer";
import type { Entry } from "yauzl";
import { fromBufferPromise } from "yauzl";
import { InvalidResumeDocumentError } from "@/core/errors/application-errors";

export const MAX_DOCX_ARCHIVE_ENTRIES = 1_000;
export const MAX_DOCX_ENTRY_BYTES = 10 * 1024 * 1024;
export const MAX_DOCX_XML_ENTRY_BYTES = 2 * 1024 * 1024;
export const MAX_DOCX_EXPANDED_BYTES = 25 * 1024 * 1024;

const CONTENT_TYPES_PATH = "[Content_Types].xml";
const MAIN_DOCUMENT_PATH = "word/document.xml";
const CONTENT_TYPES_MAX_BYTES = 256 * 1024;
const DOCX_MAIN_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

function rejectDocx(message: string, cause?: unknown): never {
  throw new InvalidResumeDocumentError(
    "This file is not a valid DOCX document.",
    cause ?? new Error(message),
  );
}

function isDirectory(entry: Entry) {
  return entry.fileName.endsWith("/");
}

function isUnixSymbolicLink(entry: Entry) {
  const creatorPlatform = entry.versionMadeBy >>> 8;
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return creatorPlatform === 3 && (unixMode & 0xf000) === 0xa000;
}

function entryLimit(entry: Entry) {
  if (entry.fileName === CONTENT_TYPES_PATH) return CONTENT_TYPES_MAX_BYTES;
  if (/\.(?:xml|rels)$/iu.test(entry.fileName)) {
    return MAX_DOCX_XML_ENTRY_BYTES;
  }
  return MAX_DOCX_ENTRY_BYTES;
}

function assertSafeEntry(entry: Entry, seenNames: Set<string>) {
  const normalizedName = entry.fileName.toLocaleLowerCase("en-US");
  if (!entry.fileName || entry.fileName.includes("\0")) {
    rejectDocx("This DOCX contains an invalid archive entry name.");
  }
  if (seenNames.has(normalizedName)) {
    rejectDocx("This DOCX contains duplicate archive entries.");
  }
  seenNames.add(normalizedName);

  if (entry.isEncrypted()) {
    rejectDocx("Encrypted DOCX files are not supported.");
  }
  if (
    !entry.canDecodeFileData() ||
    (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
  ) {
    rejectDocx("This DOCX uses an unsupported archive compression method.");
  }
  if (isUnixSymbolicLink(entry)) {
    rejectDocx("This DOCX contains an unsupported symbolic-link entry.");
  }
  if (isDirectory(entry) && entry.uncompressedSize !== 0) {
    rejectDocx("This DOCX contains an invalid directory entry.");
  }
  if (entry.uncompressedSize > entryLimit(entry)) {
    rejectDocx(
      "This DOCX expands beyond RoleProwl's safe document-processing limits.",
    );
  }
  if (
    normalizedName === "word/vbaproject.bin" ||
    normalizedName.startsWith("word/activex/")
  ) {
    rejectDocx("Macro-enabled or active-content DOCX files are not supported.");
  }
}

function hasDocxMainContentType(contentTypesXml: string) {
  const escapedMainContentType = DOCX_MAIN_CONTENT_TYPE.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&",
  );
  const overrideTags =
    contentTypesXml.match(/<(?:[\w.-]+:)?Override\b[^>]*>/giu) ?? [];
  return overrideTags.some(
    (tag) =>
      /\bPartName\s*=\s*["']\/word\/document\.xml["']/iu.test(tag) &&
      new RegExp(
        `\\bContentType\\s*=\\s*["']${escapedMainContentType}["']`,
        "iu",
      ).test(tag),
  );
}

export async function assertDocxArchiveIsSafe(bytes: Uint8Array) {
  try {
    const zipFile = await fromBufferPromise(Buffer.from(bytes), {
      decodeStrings: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });

    if (zipFile.entryCount > MAX_DOCX_ARCHIVE_ENTRIES) {
      rejectDocx(
        "This DOCX contains too many archive entries to process safely.",
      );
    }

    const seenNames = new Set<string>();
    let contentTypesXml: string | undefined;
    let declaredExpandedBytes = 0;
    let actualExpandedBytes = 0;

    for await (const entry of zipFile.eachEntry()) {
      assertSafeEntry(entry, seenNames);
      declaredExpandedBytes += entry.uncompressedSize;
      if (declaredExpandedBytes > MAX_DOCX_EXPANDED_BYTES) {
        rejectDocx(
          "This DOCX expands beyond RoleProwl's safe document-processing limits.",
        );
      }
      if (isDirectory(entry)) continue;

      const stream = await zipFile.openReadStreamPromise(entry);
      const captureContentTypes = entry.fileName === CONTENT_TYPES_PATH;
      const contentTypeChunks: Buffer[] = [];
      let actualEntryBytes = 0;
      try {
        for await (const chunk of stream) {
          const chunkBuffer = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk as Uint8Array);
          actualEntryBytes += chunkBuffer.byteLength;
          actualExpandedBytes += chunkBuffer.byteLength;
          if (
            actualEntryBytes > entryLimit(entry) ||
            actualExpandedBytes > MAX_DOCX_EXPANDED_BYTES
          ) {
            stream.destroy();
            rejectDocx(
              "This DOCX expands beyond RoleProwl's safe document-processing limits.",
            );
          }
          if (captureContentTypes) contentTypeChunks.push(chunkBuffer);
        }
      } finally {
        stream.destroy();
      }

      if (captureContentTypes) {
        contentTypesXml = Buffer.concat(contentTypeChunks).toString("utf8");
      }
    }

    if (
      !seenNames.has(CONTENT_TYPES_PATH.toLocaleLowerCase("en-US")) ||
      !seenNames.has(MAIN_DOCUMENT_PATH.toLocaleLowerCase("en-US")) ||
      !contentTypesXml ||
      !hasDocxMainContentType(contentTypesXml)
    ) {
      rejectDocx(
        "This file is a ZIP archive, but it is not a valid DOCX document.",
      );
    }
    if (/macroEnabled/iu.test(contentTypesXml)) {
      rejectDocx(
        "Macro-enabled or active-content DOCX files are not supported.",
      );
    }
  } catch (error) {
    if (error instanceof InvalidResumeDocumentError) throw error;
    rejectDocx(
      "This DOCX archive is malformed or has inconsistent compressed data.",
      error,
    );
  }
}
