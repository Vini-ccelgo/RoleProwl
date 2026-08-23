import type { NotificationType } from "@/generated/prisma/client";

export interface NotificationPreferenceValue {
  applicationUpdates: boolean;
  jobUpdates: boolean;
  reviewRequired: boolean;
  workflowFailures: boolean;
}

export interface NotificationPreferenceStore {
  notificationPreferences: {
    findUnique(input: {
      where: { userId: string };
      select: {
        applicationUpdates: true;
        jobUpdates: true;
        reviewRequired: true;
        workflowFailures: true;
      };
    }): Promise<NotificationPreferenceValue | null>;
  };
}

export function preferenceAllows(
  type: NotificationType,
  preferences: NotificationPreferenceValue | null,
) {
  if (!preferences) return true;
  if (type === "APPLICATION_SUBMITTED") return preferences.applicationUpdates;
  if (type === "JOB_UNAVAILABLE") return preferences.jobUpdates;
  if (type === "WORKFLOW_FAILED") return preferences.workflowFailures;
  return preferences.reviewRequired;
}

export async function notificationAllowed(
  store: NotificationPreferenceStore,
  userId: string,
  type: NotificationType,
) {
  const preferences = await store.notificationPreferences.findUnique({
    where: { userId },
    select: {
      applicationUpdates: true,
      jobUpdates: true,
      reviewRequired: true,
      workflowFailures: true,
    },
  });
  return preferenceAllows(type, preferences);
}
