import "server-only";
import { requireLegitimateDestination } from "@/core/domain/applications/submission";
import {
  ApplicationError,
  ConflictError,
  IntegrationError,
  NotFoundError,
} from "@/core/errors/application-errors";
import { MATCH_SCORING_VERSION } from "@/core/domain/matching/match-job";
import { selectApplicationResume } from "@/core/domain/applications/application-resume";
import type { ApplicationStartRepository } from "@/features/applications/start-application";
import { Prisma } from "@/generated/prisma/client";
import { databaseClient } from "@/lib/db/client";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function retryableTransactionConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

export class PrismaApplicationStartRepository implements ApplicationStartRepository {
  async createOrGet(
    input: Parameters<ApplicationStartRepository["createOrGet"]>[0],
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await databaseClient().$transaction(
          async (transaction) => {
            const existing = await transaction.application.findFirst({
              where: { userId: input.userId, jobId: input.jobId },
              orderBy: { createdAt: "asc" },
              select: { id: true, state: true },
            });
            if (existing)
              return {
                applicationId: existing.id,
                created: false,
                state: existing.state,
              };

            const job = await transaction.job.findFirst({
              where: { id: input.jobId, status: "ACTIVE" },
              select: {
                id: true,
                candidateDispositions: {
                  where: { userId: input.userId },
                  select: { status: true },
                  take: 1,
                },
                matchAnalyses: {
                  where: {
                    userId: input.userId,
                    scoringVersion: MATCH_SCORING_VERSION,
                  },
                  orderBy: { updatedAt: "desc" },
                  take: 1,
                },
                resumeVersions: {
                  where: { userId: input.userId },
                  orderBy: { generatedAt: "desc" },
                  select: {
                    id: true,
                    renderedContentType: true,
                    renderedFileName: true,
                    renderedStorageKey: true,
                  },
                  take: 1,
                },
                reviewQueueItems: {
                  where: {
                    userId: input.userId,
                    status: { in: ["PENDING", "DEFERRED"] },
                  },
                  select: { id: true, policyResult: true, reasonCodes: true },
                  take: 1,
                },
                sourceRecords: {
                  orderBy: { lastSeenAt: "desc" },
                  select: {
                    applicationUrl: true,
                    externalId: true,
                    source: true,
                  },
                  take: 1,
                },
                writingArtifacts: {
                  where: { userId: input.userId },
                  orderBy: { generatedAt: "desc" },
                  select: { content: true, type: true },
                  take: 20,
                },
              },
            });
            if (!job) throw new NotFoundError("Active job not found.");
            if (job.candidateDispositions[0]?.status === "REJECTED")
              throw new ConflictError(
                "Reconsider this job before preparing an application.",
              );
            const source = job.sourceRecords[0];
            const destination = requireLegitimateDestination(
              source?.applicationUrl ?? null,
            );
            const tailoredResume = job.resumeVersions[0] ?? null;
            const candidateDocument = tailoredResume
              ? null
              : await transaction.candidateDocument.findFirst({
                  where: { userId: input.userId, status: "EXTRACTED" },
                  orderBy: { createdAt: "desc" },
                  select: {
                    originalFileName: true,
                    mimeType: true,
                    storageKey: true,
                  },
                });
            const resume = selectApplicationResume({
              tailoredResume,
              candidateDocument,
            });
            const generatedText = Object.fromEntries(
              job.writingArtifacts
                .filter(
                  (artifact, index, artifacts) =>
                    artifacts.findIndex(
                      (candidate) => candidate.type === artifact.type,
                    ) === index,
                )
                .map((artifact) => [artifact.type, artifact.content]),
            );
            const documents = resume ? [resume.document] : [];
            const applicationPackage = {
              answers: {},
              destinationUrl: destination,
              documents,
              generatedText,
              idempotencyKey: `application:${input.userId}:${input.jobId}`,
              reference: {
                externalId: source?.externalId ?? input.jobId,
                source: source?.source ?? "UNKNOWN",
              },
              resumeVersionId: resume?.resumeVersionId ?? null,
            };
            const review = job.reviewQueueItems[0] ?? null;
            const state = review
              ? ("NEEDS_REVIEW" as const)
              : ("PREPARING" as const);
            const analysis = job.matchAnalyses[0] ?? null;
            const fitSnapshot = analysis
              ? {
                  confidence: analysis.confidence,
                  overallFit: analysis.overallFit,
                  preferenceScore: analysis.preferenceScore,
                  qualificationScore: analysis.qualificationScore,
                  scoringVersion: analysis.scoringVersion,
                }
              : { status: "NOT_ANALYZED" };
            const policySnapshot = review
              ? {
                  status: "NEEDS_REVIEW",
                  queueItemId: review.id,
                  policyResult: review.policyResult,
                  reasonCodes: review.reasonCodes,
                }
              : { status: "NOT_EVALUATED" };
            const application = await transaction.application.create({
              data: {
                userId: input.userId,
                jobId: job.id,
                resumeVersionId: resume?.resumeVersionId,
                state,
                fitSnapshot: json(fitSnapshot),
                generatedTextSnapshot: json(generatedText),
                answersSnapshot: json({}),
                documentsSnapshot: json(documents),
                policyResultSnapshot: json(policySnapshot),
                submissionPayloadSnapshot: json(applicationPackage),
                submissionMechanism: "EXTERNAL_APPLICATION",
                submissionDestination: destination,
                events: {
                  create: {
                    actorUserId: input.userId,
                    type: "STATE_CHANGED",
                    toState: state,
                    detail: json({ source: "CANDIDATE_REQUEST" }),
                  },
                },
              },
              select: { id: true, state: true },
            });
            await transaction.auditEvent.create({
              data: {
                actorUserId: input.userId,
                action: "APPLICATION_GENERATED",
                entityType: "application",
                entityId: application.id,
                metadata: json({
                  mechanism: "EXTERNAL_APPLICATION",
                  decisionVersion: "candidate-start-v1",
                }),
              },
            });
            return {
              applicationId: application.id,
              created: true,
              state: application.state,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (attempt < 2 && retryableTransactionConflict(error)) continue;
        if (error instanceof ApplicationError) throw error;
        throw new IntegrationError(
          "The application workflow could not be started.",
          error,
        );
      }
    }
    throw new IntegrationError(
      "The application workflow could not be started.",
    );
  }
}
