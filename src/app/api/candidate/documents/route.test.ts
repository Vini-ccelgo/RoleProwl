import { Buffer } from "node:buffer";
import { Document, Packer, Paragraph } from "docx";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RESUME_BYTES } from "@/core/domain/candidate/resume-import";

const mocks = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  databaseClient: vi.fn(),
  documentStorage: vi.fn(),
  invalidateReadyApplicationPackets: vi.fn(),
  logger: { log: vi.fn() },
  requireAuthenticatedActor: vi.fn(async () => ({ id: "candidate-1" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor: mocks.requireAuthenticatedActor,
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({ kind: "auth" })),
}));
vi.mock("@/integrations/storage/document-storage", () => ({
  documentStorage: mocks.documentStorage,
}));
vi.mock("@/integrations/security/prisma-rate-limiter", () => ({
  PrismaRateLimiter: class {
    consume(...input: unknown[]) {
      return mocks.consumeRateLimit(...input);
    }
  },
}));
vi.mock("@/integrations/applications/invalidate-application-packets", () => ({
  invalidateReadyApplicationPackets: mocks.invalidateReadyApplicationPackets,
}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: mocks.databaseClient,
}));
vi.mock("@/lib/logging/logger", () => ({ logger: mocks.logger }));

import { POST } from "./route";

interface PersistedExtraction {
  characterCount?: number;
  errorCode?: string;
  errorMessage?: string;
  extractedText?: string;
  id: string;
  pageCount?: number | null;
  status: "PENDING" | "SUCCEEDED" | "EXTRACTION_UNSUPPORTED";
}

interface PersistedDocument {
  contentHash: string;
  extraction: PersistedExtraction;
  id: string;
  status: "PROCESSING" | "EXTRACTED" | "EXTRACTION_UNSUPPORTED";
  storageKey: string;
  userId: string;
}

function ingestionHarness() {
  const objects = new Map<string, Uint8Array>();
  const documents = new Map<string, PersistedDocument>();
  const extractions = new Map<string, PersistedExtraction>();
  const proposals: unknown[] = [];
  let nextDocumentId = 1;

  const storage = {
    put: vi.fn(async (key: string, bytes: Uint8Array, contentType: string) => {
      objects.set(key, new Uint8Array(bytes));
      return { key, contentType, size: bytes.byteLength };
    }),
    get: vi.fn(async (key: string) => {
      const bytes = objects.get(key);
      return bytes ? new Uint8Array(bytes) : null;
    }),
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
  };

  const candidateDocument = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if ("userId_contentHash" in where) {
        const identity = where.userId_contentHash as {
          contentHash: string;
          userId: string;
        };
        return (
          [...documents.values()].find(
            (document) =>
              document.userId === identity.userId &&
              document.contentHash === identity.contentHash,
          ) ?? null
        );
      }
      if ("storageKey" in where) {
        return (
          [...documents.values()].find(
            (document) => document.storageKey === where.storageKey,
          ) ?? null
        );
      }
      return null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = `document-${nextDocumentId}`;
      const extraction: PersistedExtraction = {
        id: `extraction-${nextDocumentId}`,
        status: "PENDING",
      };
      nextDocumentId += 1;
      const document: PersistedDocument = {
        contentHash: String(data.contentHash),
        extraction,
        id,
        status: "PROCESSING",
        storageKey: String(data.storageKey),
        userId: String(data.userId),
      };
      documents.set(id, document);
      extractions.set(id, extraction);
      return document;
    }),
    update: vi.fn(
      async ({
        data,
        where,
      }: {
        data: Partial<PersistedDocument>;
        where: { id: string };
      }) => {
        const document = documents.get(where.id);
        if (!document) throw new Error("missing synthetic document");
        Object.assign(document, data);
        return document;
      },
    ),
    deleteMany: vi.fn(
      async ({
        where,
      }: {
        where: { status: string; storageKey: string; userId: string };
      }) => {
        const document = [...documents.values()].find(
          (candidate) =>
            candidate.status === where.status &&
            candidate.storageKey === where.storageKey &&
            candidate.userId === where.userId,
        );
        if (!document) return { count: 0 };
        documents.delete(document.id);
        extractions.delete(document.id);
        return { count: 1 };
      },
    ),
  };

  const transaction = {
    candidateDocument,
    documentExtraction: {
      update: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Partial<PersistedExtraction>;
          where: { documentId: string };
        }) => {
          const extraction = extractions.get(where.documentId);
          if (!extraction) throw new Error("missing synthetic extraction");
          Object.assign(extraction, data);
          return extraction;
        },
      ),
    },
    candidateFactProposal: {
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
        proposals.push(...data);
        return { count: data.length };
      }),
    },
  };

  const database = {
    candidateDocument,
    $transaction: vi.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  return {
    database,
    documents,
    extractions,
    objects,
    proposals,
    storage,
  };
}

type Harness = ReturnType<typeof ingestionHarness>;
let harness: Harness;

function uploadRequest(input: {
  bytes: Uint8Array;
  contentLength?: number;
  fileName: string;
  mimeType: string;
}) {
  const body = new FormData();
  body.set(
    "resume",
    new File([Buffer.from(input.bytes)], input.fileName, {
      type: input.mimeType,
    }),
  );
  return new Request("https://roleprowl.test/api/candidate/documents", {
    method: "POST",
    headers: {
      "content-length": String(
        input.contentLength ?? input.bytes.byteLength + 1_024,
      ),
      origin: "https://roleprowl.test",
    },
    body,
  });
}

async function textPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  [
    "synthetic@example.test",
    "PROFESSIONAL EXPERIENCE",
    "Built reliable upload validation",
    "TECHNICAL SKILLS",
    "TypeScript",
  ].forEach((line, index) =>
    page.drawText(line, { x: 72, y: 720 - index * 24, font, size: 12 }),
  );
  return pdf.save();
}

async function imageOnlyPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

async function textDocx() {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph("synthetic@example.test"),
          new Paragraph("PROFESSIONAL EXPERIENCE"),
          new Paragraph("Built reliable upload validation"),
          new Paragraph("TECHNICAL SKILLS"),
          new Paragraph("TypeScript"),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

async function arbitraryZip() {
  const zip = new JSZip();
  zip.file("not-a-resume.txt", "synthetic");
  return zip.generateAsync({ type: "uint8array" });
}

async function docxMissingRequiredStructure() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  return zip.generateAsync({ type: "uint8array" });
}

function expectNoDurableDocument() {
  expect(harness.documents.size).toBe(0);
  expect(harness.extractions.size).toBe(0);
  expect(harness.proposals).toHaveLength(0);
  expect(harness.objects.size).toBe(0);
  expect(harness.database.candidateDocument.findUnique).not.toHaveBeenCalled();
  expect(harness.database.candidateDocument.create).not.toHaveBeenCalled();
  expect(harness.storage.put).not.toHaveBeenCalled();
  expect(harness.storage.delete).not.toHaveBeenCalled();
}

describe("candidate document upload acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness = ingestionHarness();
    mocks.databaseClient.mockReturnValue(harness.database);
    mocks.documentStorage.mockReturnValue(harness.storage);
    mocks.consumeRateLimit.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
    mocks.invalidateReadyApplicationPackets.mockResolvedValue(undefined);
  });

  it.each([
    {
      fileName: "valid-resume.pdf",
      mimeType: "application/pdf",
      bytes: textPdf,
    },
    {
      fileName: "valid-resume.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: textDocx,
    },
  ])("persists an extracted $fileName", async (fixture) => {
    const response = await POST(
      uploadRequest({ ...fixture, bytes: await fixture.bytes() }),
    );

    const result = await response.clone().json();
    expect(
      response.status,
      JSON.stringify({ logs: mocks.logger.log.mock.calls, result }),
    ).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      proposalCount: expect.any(Number),
      status: "EXTRACTED",
    });
    expect([...harness.documents.values()]).toEqual([
      expect.objectContaining({ status: "EXTRACTED" }),
    ]);
    expect([...harness.extractions.values()]).toEqual([
      expect.objectContaining({ status: "SUCCEEDED" }),
    ]);
    expect(harness.proposals.length).toBeGreaterThan(0);
    expect(harness.objects.size).toBe(1);
    expect(harness.storage.put).toHaveBeenCalledOnce();
  });

  it("persists a structurally valid image-only PDF as extraction unsupported", async () => {
    const response = await POST(
      uploadRequest({
        bytes: new Uint8Array(await imageOnlyPdf()),
        fileName: "image-only.pdf",
        mimeType: "application/pdf",
      }),
    );

    const result = await response.clone().json();
    expect(
      response.status,
      JSON.stringify({ logs: mocks.logger.log.mock.calls, result }),
    ).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "EXTRACTION_UNSUPPORTED",
      error: expect.stringContaining("OCR is not supported"),
    });
    expect([...harness.documents.values()]).toEqual([
      expect.objectContaining({ status: "EXTRACTION_UNSUPPORTED" }),
    ]);
    expect([...harness.extractions.values()]).toEqual([
      expect.objectContaining({
        errorCode: "EXTRACTION_UNSUPPORTED",
        status: "EXTRACTION_UNSUPPORTED",
      }),
    ]);
    expect(harness.proposals).toHaveLength(0);
    expect(harness.objects.size).toBe(1);
  });

  it("rejects a malformed PDF with valid PDF magic before persistence", async () => {
    const response = await POST(
      uploadRequest({
        bytes: new Uint8Array(
          Buffer.from("%PDF-1.7\nthis is not a structurally valid PDF"),
        ),
        fileName: "malformed-resume.pdf",
        mimeType: "application/pdf",
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_DOCUMENT",
      error: "This file is not a valid PDF.",
    });
    expectNoDurableDocument();
  });

  it("rejects an arbitrary ZIP renamed DOCX before persistence", async () => {
    const response = await POST(
      uploadRequest({
        bytes: await arbitraryZip(),
        fileName: "fake-resume.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_DOCUMENT",
      error: "This file is not a valid DOCX document.",
    });
    expectNoDurableDocument();
  });

  it("rejects a malformed ZIP with DOCX magic before persistence", async () => {
    const response = await POST(
      uploadRequest({
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]),
        fileName: "malformed-resume.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
    expectNoDurableDocument();
  });

  it("rejects a DOCX missing required OOXML structure", async () => {
    const response = await POST(
      uploadRequest({
        bytes: await docxMissingRequiredStructure(),
        fileName: "missing-document-part.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
    expectNoDurableDocument();
  });

  it("rejects an oversized file before durable acceptance", async () => {
    const bytes = new Uint8Array(MAX_RESUME_BYTES + 1);
    bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const response = await POST(
      uploadRequest({
        bytes,
        contentLength: MAX_RESUME_BYTES + 256 * 1024 + 1,
        fileName: "oversized.pdf",
        mimeType: "application/pdf",
      }),
    );

    expect(response.status).toBe(400);
    expectNoDurableDocument();
  });
});
