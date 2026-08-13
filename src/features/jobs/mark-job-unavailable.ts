import type { NotificationProvider } from "@/core/contracts/notification-provider";
import { NotFoundError } from "@/core/errors/application-errors";
import { sendInternalNotification } from "@/features/notifications/send-internal-notification";

export interface JobAvailabilityRepository {
  markUnavailable(jobId: string): Promise<{
    readonly company: string;
    readonly interestedUserIds: readonly string[];
    readonly title: string;
  } | null>;
}

export async function markJobUnavailable(input: {
  readonly jobId: string;
  readonly notifications: NotificationProvider;
  readonly repository: JobAvailabilityRepository;
}) {
  const job = await input.repository.markUnavailable(input.jobId);
  if (!job) throw new NotFoundError("Job not found.");
  await Promise.all(
    job.interestedUserIds.map((userId) =>
      sendInternalNotification({
        provider: input.notifications,
        notification: {
          userId,
          type: "JOB_UNAVAILABLE",
          title: "Job is no longer available",
          body: `${job.title} at ${job.company} is no longer marked active in RoleProwl.`,
          entityType: "job",
          entityId: input.jobId,
          dedupeKey: `job-unavailable:${input.jobId}`,
        },
      }),
    ),
  );
  return { notified: job.interestedUserIds.length };
}
