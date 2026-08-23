import "server-only";
import type { ObjectStorageProvider } from "@/core/contracts/object-storage-provider";
import { ConflictError, NotFoundError } from "@/core/errors/application-errors";
import type { Prisma } from "@/generated/prisma/client";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";
import { documentStorage } from "@/integrations/storage/document-storage";
import { databaseClient } from "@/lib/db/client";

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
    readonly documentId: string;
    readonly userId: string;
  }) {
    const database = databaseClient();
    const document = await database.candidateDocument.findFirst({
      where: { id: input.documentId, userId: input.userId },
      select: { id: true, storageKey: true },
    });
    if (!document)
      throw new NotFoundError("The requested document was not found.");

    const [activeFacts, applications] = await Promise.all([
      database.candidateFact.count({
        where: {
          userId: input.userId,
          status: "ACTIVE",
          sourceProposal: { documentId: document.id },
        },
      }),
      database.application.findMany({
        where: { userId: input.userId },
        select: {
          id: true,
          submittedAt: true,
          documentsSnapshot: true,
          submissionPayloadSnapshot: true,
        },
      }),
    ]);
    if (activeFacts > 0)
      throw new ConflictError(
        "Remove the accepted résumé facts sourced from this document before deleting it.",
      );
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
    if (references.some((application) => application.submittedAt))
      throw new ConflictError(
        "This résumé is retained because it is used by a submitted application.",
      );
    if (references.length)
      throw new ConflictError(
        "Replace or refresh this résumé in your pending applications before deleting it.",
      );

    await database.$transaction(async (transaction) => {
      await transaction.candidateFact.deleteMany({
        where: {
          userId: input.userId,
          status: "REMOVED",
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
