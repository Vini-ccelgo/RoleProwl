import {
  ConflictError,
  ValidationError,
} from "@/core/errors/application-errors";

export type ReviewQueueStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "DEFERRED";
export type ReviewQueueAction = "EDITED" | "APPROVED" | "REJECTED" | "DEFERRED";

export interface ReviewQueueTransition {
  readonly deferredUntil: Date | null;
  readonly nextStatus: ReviewQueueStatus;
}

export function transitionReviewQueueItem(input: {
  readonly action: ReviewQueueAction;
  readonly currentStatus: ReviewQueueStatus;
  readonly deferredUntil?: Date | null;
  readonly now?: Date;
}): ReviewQueueTransition {
  if (input.currentStatus === "APPROVED" || input.currentStatus === "REJECTED")
    throw new ConflictError("A resolved review item cannot be changed.");
  if (input.action === "EDITED")
    return { nextStatus: input.currentStatus, deferredUntil: null };
  if (input.action === "APPROVED")
    return { nextStatus: "APPROVED", deferredUntil: null };
  if (input.action === "REJECTED")
    return { nextStatus: "REJECTED", deferredUntil: null };
  const now = input.now ?? new Date();
  if (!input.deferredUntil || input.deferredUntil <= now)
    throw new ValidationError("A deferred review must have a future date.");
  return { nextStatus: "DEFERRED", deferredUntil: input.deferredUntil };
}

export function buildAuditedReviewMutation(input: {
  readonly action: ReviewQueueAction;
  readonly current: {
    readonly deferredUntil: Date | null;
    readonly editableDraft: unknown;
    readonly status: ReviewQueueStatus;
  };
  readonly deferredUntil?: Date | null;
  readonly editableDraft?: unknown;
  readonly note?: string | null;
  readonly now?: Date;
}) {
  const transition = transitionReviewQueueItem({
    action: input.action,
    currentStatus: input.current.status,
    deferredUntil: input.deferredUntil,
    now: input.now,
  });
  const after = {
    status: transition.nextStatus,
    deferredUntil: transition.deferredUntil,
    editableDraft:
      input.action === "EDITED"
        ? (input.editableDraft ?? null)
        : input.current.editableDraft,
  };
  return {
    update: after,
    audit: {
      action: input.action,
      before: input.current,
      after,
      note: input.note?.trim() || null,
    },
  } as const;
}
