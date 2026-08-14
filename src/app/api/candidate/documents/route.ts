import { NextResponse } from "next/server";
import {
  ApplicationError,
  AuthorizationError,
  ExtractionUnsupportedError,
  RateLimitExceededError,
} from "@/core/errors/application-errors";
import {
  MAX_RESUME_BYTES,
  assertResumeIsNotDuplicate,
  proposeFactsFromResumeText,
  validateResumeUpload,
} from "@/core/domain/candidate/resume-import";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { extractResumeText } from "@/integrations/documents/extract-resume-text";
import { documentStorage } from "@/integrations/storage/development-filesystem-storage";
import { PrismaRateLimiter } from "@/integrations/security/prisma-rate-limiter";
import { databaseClient } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import {
  assertContentLength,
  assertContentType,
  assertMutationRequestIsSameOrigin,
} from "@/lib/security/request-security";

const rateLimiter = new PrismaRateLimiter();
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

function errorResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ExtractionUnsupportedError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 422 },
    );
  }
  if (error instanceof RateLimitExceededError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      {
        status: 429,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      },
    );
  }
  if (error instanceof ApplicationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      {
        status:
          error.code === "VALIDATION"
            ? 400
            : error.code === "CONFLICT"
              ? 409
              : 500,
      },
    );
  }
  logger.log("error", "candidate_document_request_failed", {
    errorType: error instanceof Error ? error.name : "unknown",
  });
  return NextResponse.json(
    { error: "The document could not be processed. Try again." },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const documents = await databaseClient().candidateDocument.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalFileName: true,
        format: true,
        status: true,
        sizeBytes: true,
        createdAt: true,
        _count: { select: { proposals: true } },
      },
    });
    return NextResponse.json({ documents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let storedKey: string | undefined;
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    assertMutationRequestIsSameOrigin(request);
    assertContentType(request, "multipart/form-data");
    assertContentLength(request, MAX_RESUME_BYTES + MULTIPART_OVERHEAD_BYTES);
    const rateLimit = await rateLimiter.consume(
      "candidate-document-upload",
      actor.id,
      { limit: 10, windowMs: 60 * 60 * 1_000 },
    );
    if (!rateLimit.allowed)
      throw new RateLimitExceededError(rateLimit.retryAfterSeconds);
    const formData = await request.formData();
    const file = formData.get("resume");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose a PDF or DOCX résumé." },
        { status: 400 },
      );
    }

    const validated = validateResumeUpload({
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
    });
    const db = databaseClient();
    const duplicate = await db.candidateDocument.findUnique({
      where: {
        userId_contentHash: {
          userId: actor.id,
          contentHash: validated.contentHash,
        },
      },
      select: { id: true },
    });
    assertResumeIsNotDuplicate(duplicate?.id ?? null);

    const storage = documentStorage();
    await storage.put(
      validated.storageKey,
      validated.bytes,
      validated.mimeType,
    );
    storedKey = validated.storageKey;
    const document = await db.candidateDocument.create({
      data: {
        userId: actor.id,
        format: validated.format,
        originalFileName: validated.originalFileName,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
        contentHash: validated.contentHash,
        storageKey: validated.storageKey,
        extraction: { create: { userId: actor.id } },
      },
      include: { extraction: true },
    });

    try {
      const extraction = await extractResumeText(
        validated.format,
        validated.bytes,
      );
      const drafts = proposeFactsFromResumeText(extraction.text);
      await db.$transaction([
        db.candidateDocument.update({
          where: { id: document.id },
          data: { status: "EXTRACTED" },
        }),
        db.documentExtraction.update({
          where: { documentId: document.id },
          data: {
            status: "SUCCEEDED",
            extractedText: extraction.text,
            characterCount: extraction.text.length,
            pageCount: extraction.pageCount,
          },
        }),
        ...drafts.map((draft) =>
          db.candidateFactProposal.create({
            data: {
              userId: actor.id,
              documentId: document.id,
              extractionId: document.extraction!.id,
              ...draft,
            },
          }),
        ),
      ]);
      return NextResponse.json(
        {
          documentId: document.id,
          proposalCount: drafts.length,
          status: "EXTRACTED",
        },
        { status: 201 },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Text extraction is unsupported for this document.";
      await db.$transaction([
        db.candidateDocument.update({
          where: { id: document.id },
          data: { status: "EXTRACTION_UNSUPPORTED" },
        }),
        db.documentExtraction.update({
          where: { documentId: document.id },
          data: {
            status: "EXTRACTION_UNSUPPORTED",
            errorCode: "EXTRACTION_UNSUPPORTED",
            errorMessage: message,
          },
        }),
      ]);
      throw error;
    }
  } catch (error) {
    if (storedKey && !(error instanceof ExtractionUnsupportedError)) {
      await documentStorage()
        .delete(storedKey)
        .catch(() => undefined);
    }
    return errorResponse(error);
  }
}
