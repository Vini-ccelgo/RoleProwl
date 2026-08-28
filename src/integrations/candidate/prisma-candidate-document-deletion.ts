import "server-only";
import type { ObjectStorageProvider } from "@/core/contracts/object-storage-provider";
import { ConflictError, NotFoundError } from "@/core/errors/application-errors";
import { classifyApplicationForResumeDeletion } from "@/core/domain/applications/application-resume-deletion";
import { applicationResumeSnapshot } from "@/core/domain/applications/application-resume";
import { Prisma } from "@/generated/prisma/client";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";
import { documentStorage } from "@/integrations/storage/document-storage";
import { databaseClient } from "@/lib/db/client";
import {
  DOCUMENT_DELETION_CONFIRMATION_REQUIRED,
  type DocumentDeletionConsequences,
} from "@/features/candidate/document-deletion-protocol";

export class DocumentDeletionConfirmationRequiredError extends ConflictError {
  readonly confirmationCode = DOCUMENT_DELETION_CONFIRMATION_REQUIRED;
  readonly protocolKind = "CANDIDATE_DOCUMENT_DELETION_CONFIRMATION";

  constructor(readonly consequences: DocumentDeletionConsequences) {
    super("Confirm deletion of this résumé and its dependent data.");
  }
}

function applicationUsesResumeStorageKey(
  documentsSnapshot: unknown,
  storageKey: string,
) {
  return (
    applicationResumeSnapshot(documentsSnapshot)?.storageKey === storageKey
  );
}

export class PrismaCandidateDocumentDeletion {
  constructor(
    private readonly storage: ObjectStorageProvider = documentStorage(),
  ) {}

  async delete(input: {
    readonly confirmDeletion?: boolean;
    readonly documentId: string;
    readonly userId: string;
  }) {
    const database = databaseClient();
    try {
      await database.$transaction(
        async (transaction) => {
          const document = await transaction.candidateDocument.findFirst({
            where: { id: input.documentId, userId: input.userId },
            select: { id: true, originalFileName: true, storageKey: true },
          });
          if (!document)
            throw new NotFoundError("The requested document was not found.");

          const [acceptedFactCount, applications] = await Promise.all([
            transaction.candidateFact.count({
              where: {
                userId: input.userId,
                status: "ACTIVE",
                sourceProposal: { documentId: document.id },
              },
            }),
            transaction.application.findMany({
              where: { userId: input.userId },
              select: {
                id: true,
                state: true,
                submittedAt: true,
                externalConfirmedAt: true,
                externalSubmissionId: true,
                documentsSnapshot: true,
                events: {
                  where: { type: "SUBMISSION_CONFIRMED" },
                  select: { id: true },
                  take: 1,
                },
              },
            }),
          ]);
          const references = applications.filter((application) =>
            applicationUsesResumeStorageKey(
              application.documentsSnapshot,
              document.storageKey,
            ),
          );
          const classifiedReferences = references.map((application) => ({
            application,
            classification: classifyApplicationForResumeDeletion({
              ...application,
              hasSubmissionConfirmationEvent: application.events.length > 0,
            }),
          }));
          const disposableReferences = classifiedReferences.filter(
            ({ classification }) =>
              classification === "DISPOSABLE_PRE_SUBMISSION",
          );
          const retainedReferences = classifiedReferences.filter(
            ({ classification }) =>
              classification === "RETAINED_SUBMISSION_HISTORY",
          );

          const consequences = {
            acceptedFactCount,
            fileName: document.originalFileName,
            preSubmissionApplicationCount: disposableReferences.length,
            retainedHistoricalApplicationCount: retainedReferences.length,
          } satisfies DocumentDeletionConsequences;
          if (!input.confirmDeletion)
            throw new DocumentDeletionConfirmationRequiredError(consequences);

          if (disposableReferences.length) {
            const applicationIds = disposableReferences.map(
              ({ application }) => application.id,
            );
            await transaction.notification.deleteMany({
              where: {
                entityId: { in: applicationIds },
                entityType: "application",
                userId: input.userId,
              },
            });
            const deletedApplications =
              await transaction.application.deleteMany({
                where: {
                  id: { in: applicationIds },
                  userId: input.userId,
                },
              });
            if (deletedApplications.count !== disposableReferences.length)
              throw new ConflictError(
                "Application dependencies changed while the résumé was being deleted. Try again.",
              );
          }
          await transaction.candidateFact.deleteMany({
            where: {
              userId: input.userId,
              status: { in: ["ACTIVE", "REMOVED"] },
              sourceProposal: { documentId: document.id },
            },
          });
          const deletedDocument =
            await transaction.candidateDocument.deleteMany({
              where: { id: document.id, userId: input.userId },
            });
          if (deletedDocument.count !== 1)
            throw new ConflictError(
              "The résumé changed while it was being deleted. Try again.",
            );

          await invalidateReadyApplicationPackets(transaction, input.userId);
          if (retainedReferences.length === 0) {
            // Keep the provider call last inside the transaction: a storage
            // failure rejects the operation and rolls every staged database
            // write back instead of reporting a completed deletion. The object
            // store and SQL transaction still cannot commit atomically.
            await this.storage.delete(document.storageKey);
          }
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        throw new ConflictError(
          "Résumé dependencies changed while deletion was in progress. Try again.",
        );
      throw error;
    }
  }
}
