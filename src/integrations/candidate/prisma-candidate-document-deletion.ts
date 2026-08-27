import "server-only";
import type { ObjectStorageProvider } from "@/core/contracts/object-storage-provider";
import { ConflictError, NotFoundError } from "@/core/errors/application-errors";
import { applicationIsProtectedFromResumeDeletion } from "@/core/domain/applications/application-resume-deletion";
import type { Prisma } from "@/generated/prisma/client";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";
import { documentStorage } from "@/integrations/storage/document-storage";
import { databaseClient } from "@/lib/db/client";
import {
  DOCUMENT_DELETION_CONFIRMATION_REQUIRED,
  type DocumentDeletionBlockingApplication,
  type DocumentDeletionConsequences,
  SUBMITTED_APPLICATION_REFERENCES,
} from "@/features/candidate/document-deletion-protocol";

export class DocumentDeletionConfirmationRequiredError extends ConflictError {
  readonly confirmationCode = DOCUMENT_DELETION_CONFIRMATION_REQUIRED;
  readonly protocolKind = "CANDIDATE_DOCUMENT_DELETION_CONFIRMATION";

  constructor(readonly consequences: DocumentDeletionConsequences) {
    super("Confirm deletion of this résumé and its dependent data.");
  }
}

export class CandidateDocumentApplicationReferenceError extends ConflictError {
  readonly protocolKind = "CANDIDATE_DOCUMENT_APPLICATION_REFERENCE";
  readonly referenceCode = SUBMITTED_APPLICATION_REFERENCES;

  constructor(
    readonly applications: readonly DocumentDeletionBlockingApplication[],
  ) {
    super(
      "This résumé is retained because an active or historical submission depends on it.",
    );
  }
}

function containsStorageKey(
  value: Prisma.JsonValue | undefined,
  storageKey: string,
): boolean {
  if (typeof value === "string") return value === storageKey;
  if (Array.isArray(value))
    return value.some((entry) => containsStorageKey(entry, storageKey));
  if (value && typeof value === "object")
    return Object.values(value).some((entry) =>
      containsStorageKey(entry, storageKey),
    );
  return false;
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
              submissionPayloadSnapshot: true,
              job: { select: { company: true, title: true } },
            },
          }),
        ]);
        const references = applications.filter(
          (application) =>
            containsStorageKey(
              application.documentsSnapshot,
              document.storageKey,
            ) ||
            containsStorageKey(
              application.submissionPayloadSnapshot,
              document.storageKey,
            ),
        );
        const protectedReferences = references.filter(
          applicationIsProtectedFromResumeDeletion,
        );
        if (protectedReferences.length)
          throw new CandidateDocumentApplicationReferenceError(
            protectedReferences.map((application) => ({
              applicationId: application.id,
              company: application.job.company,
              jobTitle: application.job.title,
            })),
          );

        const consequences = {
          acceptedFactCount,
          applicationCount: references.length,
          documentId: document.id,
          fileName: document.originalFileName,
        } satisfies DocumentDeletionConsequences;
        if (!input.confirmDeletion)
          throw new DocumentDeletionConfirmationRequiredError(consequences);

        if (references.length) {
          const applicationIds = references.map(({ id }) => id);
          await transaction.notification.deleteMany({
            where: {
              entityId: { in: applicationIds },
              entityType: "application",
              userId: input.userId,
            },
          });
          const deletedApplications = await transaction.application.deleteMany({
            where: {
              id: { in: applicationIds },
              userId: input.userId,
            },
          });
          if (deletedApplications.count !== references.length)
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
        const deletedDocument = await transaction.candidateDocument.deleteMany({
          where: { id: document.id, userId: input.userId },
        });
        if (deletedDocument.count !== 1)
          throw new ConflictError(
            "The résumé changed while it was being deleted. Try again.",
          );

        await invalidateReadyApplicationPackets(transaction, input.userId);
        // Keep the provider call last inside the transaction: a storage
        // failure rejects the operation and rolls every staged database write
        // back instead of reporting a completed deletion.
        await this.storage.delete(document.storageKey);
      },
      { isolationLevel: "Serializable" },
    );
  }
}
