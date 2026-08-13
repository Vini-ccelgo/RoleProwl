import "server-only";
import type { JobAvailabilityRepository } from "@/features/jobs/mark-job-unavailable";
import { databaseClient } from "@/lib/db/client";

export class PrismaJobAvailabilityRepository implements JobAvailabilityRepository {
  async markUnavailable(jobId: string) {
    const database = databaseClient();
    return database.$transaction(async (transaction) => {
      const job = await transaction.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          title: true,
          company: true,
          applications: { select: { userId: true } },
          matchAnalyses: { select: { userId: true } },
        },
      });
      if (!job) return null;
      await transaction.job.update({
        where: { id: job.id },
        data: { status: "CLOSED" },
      });
      return {
        title: job.title,
        company: job.company,
        interestedUserIds: [
          ...new Set([
            ...job.applications.map(({ userId }) => userId),
            ...job.matchAnalyses.map(({ userId }) => userId),
          ]),
        ],
      };
    });
  }
}
