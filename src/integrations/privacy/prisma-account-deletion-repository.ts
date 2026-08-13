import "server-only";
import { createHash } from "node:crypto";
import type { AccountDeletionRepository } from "@/features/privacy/delete-account";
import { databaseClient } from "@/lib/db/client";

function subjectHash(userId: string) {
  return createHash("sha256")
    .update(`roleprowl-delete-v1:${userId}`)
    .digest("hex");
}

export class PrismaAccountDeletionRepository implements AccountDeletionRepository {
  async begin({ userId }: { readonly userId: string }) {
    const database = databaseClient();
    return database.$transaction(async (transaction) => {
      const user = await transaction.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          externalAuthId: true,
          candidateDocuments: { select: { storageKey: true } },
          resumeVersions: { select: { renderedStorageKey: true } },
        },
      });
      const storageKeys = [
        ...user.candidateDocuments.map(({ storageKey }) => storageKey),
        ...user.resumeVersions.map(
          ({ renderedStorageKey }) => renderedStorageKey,
        ),
      ];
      await transaction.auditEvent.create({
        data: {
          actorUserId: userId,
          action: "ACCOUNT_DELETION_REQUESTED",
          entityType: "user",
          entityId: userId,
          metadata: { retentionPolicyVersion: "account-deletion-v1" },
        },
      });
      const request = await transaction.accountDeletionRequest.create({
        data: {
          subjectHash: subjectHash(userId),
          externalAuthId: user.externalAuthId,
          storageKeys,
        },
      });
      return {
        requestId: request.id,
        externalAuthId: user.externalAuthId,
        storageKeys,
      };
    });
  }

  async deleteRoleProwlData(input: {
    readonly requestId: string;
    readonly userId: string;
  }) {
    await databaseClient().$transaction([
      databaseClient().auditEvent.deleteMany({
        where: { actorUserId: input.userId },
      }),
      databaseClient().user.delete({ where: { id: input.userId } }),
    ]);
  }

  async markCleanupRequired(input: {
    readonly code: string;
    readonly requestId: string;
  }) {
    await databaseClient().accountDeletionRequest.update({
      where: { id: input.requestId },
      data: { status: "CLEANUP_REQUIRED", lastErrorCode: input.code },
    });
  }

  async markComplete(requestId: string) {
    await databaseClient().accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        externalAuthId: null,
        storageKeys: [],
        lastErrorCode: null,
      },
    });
  }
}
