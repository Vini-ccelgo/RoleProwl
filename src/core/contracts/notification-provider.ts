export const NOTIFICATION_TYPES = [
  "APPLICATION_NEEDS_REVIEW",
  "WORKFLOW_FAILED",
  "JOB_UNAVAILABLE",
  "QUESTION_NEEDS_ANSWER",
  "APPLICATION_SUBMITTED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface InternalNotification {
  readonly body: string;
  readonly dedupeKey: string;
  readonly entityId?: string;
  readonly entityType?: string;
  readonly title: string;
  readonly type: NotificationType;
  readonly userId: string;
}

export interface NotificationProvider {
  notify(notification: InternalNotification): Promise<void>;
}
