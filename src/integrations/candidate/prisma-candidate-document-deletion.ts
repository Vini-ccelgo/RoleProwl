import "server-only";
import type { ObjectStorageProvider } from "@/core/contracts/object-storage-provider";
import { ConflictError, NotFoundError } from "@/core/errors/application-errors";
import type { Prisma } from "@/generated/prisma/client";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";
import { documentStorage } from "@/integrations/storage/document-storage";
import { databaseClient } from "@/lib/db/client";
import {
  ACCEPTED_FACTS_DELETE_CONFIRMATION_REQUIRED,
  type DocumentDeletionBlockingApplication,
  PENDING_APPLICATION_REFERENCES,
  SUBMITTED_APPLICATION_REFERENCES,
} from "@/features/candidate/document-deletion-protocol";

export class AcceptedFactsDeleteConfirmationRequiredError extends ConflictError {
  readonly confirmationCode = ACCEPTED_FACTS_DELETE_CONFIRMATION_REQUIRED;

  constructor(readonly factCount: number) {
    super(
      "Deleting this résumé will also remove verified facts sourced from it. This may affect application readiness.",
    );
  }
}

export class CandidateDocumentApplicationReferenceError extends ConflictError {
  readonly protocolKind = "CANDIDATE_DOCUMENT_APPLICATION_REFERENCE";

  constructor(
    readonly referenceCode:
      | typeof PENDING_APPLICATION_REFERENCES
      | typeof SUBMITTED_APPLICATION_REFERENCES,
    readonly applications: readonly DocumentDeletionBlockingApplication[],
  ) {
    super(
      referenceCode === SUBMITTED_APPLICATION_REFERENCES
        ? "This résumé is retained because it is used by a submitted application."
        : "Select another résumé in your pending applications before deleting this one.",
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
    readonly confirmAcceptedFacts?: boolean;
    readonly documentId: string;
    readonly userId: string;
  }) {
    const database = databaseClient();
    await database.$transaction(async (transaction) => {
      const document = await transaction.candidateDocument.findFirst({
        where: { id: input.documentId, userId: input.userId },
        select: { id: true, storageKey: true },
      });
      if (!document)
        throw new NotFoundError("The requested document was not found.");

      const [activeFacts, applications] = await Promise.all([
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
            submittedAt: true,
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
      const safeReferences = references.map((application) => ({
        applicationId: application.id,
        company: application.job.company,
        jobTitle: application.job.title,
      }));
      const submittedReferences = references
        .filter((application) => application.submittedAt)
        .map((application) => ({
          applicationId: application.id,
          company: application.job.company,
          jobTitle: application.job.title,
        }));
      if (submittedReferences.length)
        throw new CandidateDocumentApplicationReferenceError(
          SUBMITTED_APPLICATION_REFERENCES,
          submittedReferences,
        );
      if (safeReferences.length)
        throw new CandidateDocumentApplicationReferenceError(
          PENDING_APPLICATION_REFERENCES,
          safeReferences,
        );
      if (activeFacts > 0 && !input.confirmAcceptedFacts)
        throw new AcceptedFactsDeleteConfirmationRequiredError(activeFacts);

      await transaction.candidateFact.deleteMany({
        where: {
          userId: input.userId,
          status: { in: ["ACTIVE", "REMOVED"] },
          sourceProposal: { documentId: document.id },
        },
      });
      const deleted = await transaction.candidateDocument.deleteMany({
        where: { id: document.id, userId: input.userId },
      });
      if (deleted.count !== 1)
        throw new ConflictError(
          "The résumé changed while it was being deleted. Try again.",
        );
      await this.storage.delete(document.storageKey);
      await invalidateReadyApplicationPackets(transaction, input.userId);
    });
  }
}
