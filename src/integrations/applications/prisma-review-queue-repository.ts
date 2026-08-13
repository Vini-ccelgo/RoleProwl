import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ReviewQueueAction } from "@/core/domain/applications/review-queue";
import { buildAuditedReviewMutation } from "@/core/domain/applications/review-queue";
import { ConflictError, NotFoundError } from "@/core/errors/application-errors";
import { databaseClient } from "@/lib/db/client";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function createReviewQueueItem(input: {
  readonly applicationMaterials: unknown;
  readonly editableDraft?: unknown;
  readonly fitSnapshot: unknown;
  readonly jobId: string;
  readonly policyResult: string;
  readonly reasonCodes: readonly string[];
  readonly sourceCapability: unknown;
  readonly unresolvedQuestions: unknown;
  readonly userId: string;
}) {
  return databaseClient().$transaction(async (transaction) => {
    const item = await transaction.reviewQueueItem.create({
      data: {
        userId: input.userId,
        jobId: input.jobId,
        reasonCodes: [...input.reasonCodes],
        fitSnapshot: json(input.fitSnapshot),
        applicationMaterials: json(input.applicationMaterials),
        unresolvedQuestions: json(input.unresolvedQuestions),
        policyResult: input.policyResult,
        sourceCapability: json(input.sourceCapability),
        editableDraft:
          input.editableDraft === undefined
            ? undefined
            : json(input.editableDraft),
      },
    });
    await transaction.reviewQueueAuditEvent.create({
      data: {
        queueItemId: item.id,
        actorUserId: input.userId,
        action: "CREATED",
        after: json({ status: item.status, reasonCodes: item.reasonCodes }),
      },
    });
    return item;
  });
}

export async function mutateReviewQueueItem(input: {
  readonly action: ReviewQueueAction;
  readonly deferredUntil?: Date | null;
  readonly draftText?: string | null;
  readonly itemId: string;
  readonly note?: string | null;
  readonly userId: string;
}) {
  const database = databaseClient();
  return database.$transaction(async (transaction) => {
    const item = await transaction.reviewQueueItem.findFirst({
      where: { id: input.itemId, userId: input.userId },
    });
    if (!item) throw new NotFoundError();
    const editableDraft =
      input.action === "EDITED"
        ? { text: input.draftText?.trim() ?? "" }
        : item.editableDraft;
    const mutation = buildAuditedReviewMutation({
      action: input.action,
      current: {
        status: item.status,
        deferredUntil: item.deferredUntil,
        editableDraft: item.editableDraft,
      },
      deferredUntil: input.deferredUntil,
      editableDraft,
      note: input.note,
    });
    const updated = await transaction.reviewQueueItem.updateMany({
      where: { id: item.id, userId: input.userId, status: item.status },
      data: {
        status: mutation.update.status,
        deferredUntil: mutation.update.deferredUntil,
        editableDraft: json(mutation.update.editableDraft),
        resolutionNote: input.note?.trim() || null,
      },
    });
    if (updated.count !== 1)
      throw new ConflictError(
        "The review item changed before this action completed.",
      );
    await transaction.reviewQueueAuditEvent.create({
      data: {
        queueItemId: item.id,
        actorUserId: input.userId,
        action: input.action,
        before: json(mutation.audit.before),
        after: json(mutation.audit.after),
        note: mutation.audit.note,
      },
    });
    return mutation.update;
  });
}
