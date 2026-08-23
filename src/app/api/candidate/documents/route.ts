import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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
import { storeAndRetrieveResume } from "@/features/candidate/store-resume-document";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import {
  PrismaResumeIngestionRepository,
  RESUME_PERSISTENCE_TRANSACTION_TIMEOUT_MS,
  removeFailedResumeRecord,
  type ResumePersistenceSubstage,
} from "@/integrations/candidate/prisma-resume-ingestion";
import { extractResumeText } from "@/integrations/documents/extract-resume-text";
import { documentStorage } from "@/integrations/storage/document-storage";
import { storageFailureLogContext } from "@/integrations/storage/storage-diagnostics";
import { PrismaRateLimiter } from "@/integrations/security/prisma-rate-limiter";
import { databaseClient } from "@/lib/db/client";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";
import { prismaFailureLogContext } from "@/lib/db/prisma-diagnostics";
import { logger } from "@/lib/logging/logger";
import {
  assertContentLength,
  assertContentType,
  assertMutationRequestIsSameOrigin,
} from "@/lib/security/request-security";

const rateLimiter = new PrismaRateLimiter();
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export const runtime = "nodejs";

function errorResponse(error: unknown, logUnexpected = true) {
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
  if (logUnexpected) {
    logger.log("error", "candidate_document_request_failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }
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

type IngestionStage =
  | "upload"
  | "validation"
  | "storage_write"
  | "storage_retrieval"
  | "document_persistence"
  | "text_extraction"
  | "extraction_failure_persistence"
  | "truth_vault_persistence";

function persistenceOperation(substage: ResumePersistenceSubstage | null) {
  switch (substage) {
    case "document_record_create":
      return "candidate_document_create";
    case "document_status_update":
      return "candidate_document_update";
    case "extraction_status_update":
      return "document_extraction_update";
    case "fact_proposal_persistence":
      return "fact_proposal_create_many";
    case "transaction_commit":
      return "resume_persistence_commit";
    default:
      return "resume_persistence";
  }
}

export async function POST(request: Request) {
  let storedKey: string | undefined;
  let actorId: string | undefined;
  let db: ReturnType<typeof databaseClient> | undefined;
  let ingestionComplete = false;
  const pipelineState: {
    stage: IngestionStage;
    storageOperation: "put" | "get" | null;
    persistenceSubstage: ResumePersistenceSubstage | null;
  } = {
    stage: "upload",
    storageOperation: null,
    persistenceSubstage: null,
  };
  let storageRequestContext = {};
  const correlationId = randomUUID();
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    actorId = actor.id;
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

    pipelineState.stage = "validation";
    const validated = validateResumeUpload({
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
    });
    storageRequestContext = {
      bodyType: validated.bytes.constructor.name,
      bodyBytes: validated.bytes.byteLength,
      bodyLengthExplicit: true,
      mediaType: validated.mimeType,
    };
    db = databaseClient();
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
    storedKey = validated.storageKey;
    const storedBytes = await storeAndRetrieveResume(
      storage,
      validated,
      (storageStage) => {
        pipelineState.stage = storageStage;
        pipelineState.storageOperation =
          storageStage === "storage_write" ? "put" : "get";
      },
    );
    pipelineState.storageOperation = null;
    pipelineState.stage = "document_persistence";
    pipelineState.persistenceSubstage = "document_record_create";
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
    pipelineState.persistenceSubstage = null;

    pipelineState.stage = "text_extraction";
    let extraction: Awaited<ReturnType<typeof extractResumeText>>;
    try {
      extraction = await extractResumeText(validated.format, storedBytes);
    } catch (error) {
      if (!(error instanceof ExtractionUnsupportedError)) throw error;
      pipelineState.stage = "extraction_failure_persistence";
      pipelineState.persistenceSubstage = "document_status_update";
      await db.$transaction(
        async (transaction) => {
          await transaction.candidateDocument.update({
            where: { id: document.id },
            data: { status: "EXTRACTION_UNSUPPORTED" },
          });
          pipelineState.persistenceSubstage = "extraction_status_update";
          await transaction.documentExtraction.update({
            where: { documentId: document.id },
            data: {
              status: "EXTRACTION_UNSUPPORTED",
              errorCode: error.code,
              errorMessage: error.message,
            },
          });
          pipelineState.persistenceSubstage = "transaction_commit";
        },
        { timeout: RESUME_PERSISTENCE_TRANSACTION_TIMEOUT_MS },
      );
      pipelineState.persistenceSubstage = null;
      pipelineState.stage = "text_extraction";
      throw error;
    }

    const drafts = proposeFactsFromResumeText(extraction.text);
    pipelineState.stage = "truth_vault_persistence";
    const repository = new PrismaResumeIngestionRepository(db);
    await repository.persistExtractedResume(
      {
        documentId: document.id,
        extractionId: document.extraction!.id,
        extractedText: extraction.text,
        pageCount: extraction.pageCount,
        proposals: drafts,
        userId: actor.id,
      },
      (substage) => {
        pipelineState.persistenceSubstage = substage;
      },
    );
    pipelineState.persistenceSubstage = null;
    ingestionComplete = true;
    await invalidateReadyApplicationPackets(db, actor.id);
    return NextResponse.json(
      {
        documentId: document.id,
        proposalCount: drafts.length,
        status: "EXTRACTED",
      },
      { status: 201 },
    );
  } catch (error) {
    logger.log("error", "candidate_document_pipeline_failed", {
      correlationId,
      stage: pipelineState.stage,
      errorType: error instanceof Error ? error.name : "unknown",
      errorCode: error instanceof ApplicationError ? error.code : undefined,
      ...(pipelineState.persistenceSubstage
        ? prismaFailureLogContext(
            error,
            persistenceOperation(pipelineState.persistenceSubstage),
            pipelineState.persistenceSubstage,
          )
        : {}),
      ...(pipelineState.storageOperation
        ? storageFailureLogContext(
            error,
            pipelineState.storageOperation,
            storageRequestContext,
          )
        : {}),
    });
    if (
      storedKey &&
      !ingestionComplete &&
      !(error instanceof ExtractionUnsupportedError)
    ) {
      let deleteStoredObject = !db || !actorId;
      if (db && actorId) {
        try {
          deleteStoredObject = await removeFailedResumeRecord(db, {
            storageKey: storedKey,
            userId: actorId,
          });
        } catch (cleanupError) {
          deleteStoredObject = false;
          logger.log("error", "candidate_document_database_cleanup_failed", {
            correlationId,
            ...prismaFailureLogContext(
              cleanupError,
              "failed_candidate_document_delete",
              "failed_ingestion_cleanup",
            ),
          });
        }
      }
      if (deleteStoredObject) {
        try {
          await documentStorage().delete(storedKey);
        } catch (cleanupError) {
          logger.log("error", "candidate_document_storage_cleanup_failed", {
            correlationId,
            ...storageFailureLogContext(
              cleanupError,
              "delete",
              storageRequestContext,
            ),
          });
        }
      }
    }
    return errorResponse(error, false);
  }
}
