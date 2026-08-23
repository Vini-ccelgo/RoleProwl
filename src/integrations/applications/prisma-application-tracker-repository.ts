import "server-only";
import { ConflictError } from "@/core/errors/application-errors";
import type { ApplicationTrackerRepository } from "@/features/applications/update-application-state";
import type { Prisma } from "@/generated/prisma/client";
import { databaseClient } from "@/lib/db/client";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class PrismaApplicationTrackerRepository implements ApplicationTrackerRepository {
  async findState(
    input: Parameters<ApplicationTrackerRepository["findState"]>[0],
  ) {
    const application = await databaseClient().application.findFirst({
      where: { id: input.applicationId, userId: input.userId },
      select: { state: true },
    });
    return application?.state ?? null;
  }

  async transition(
    input: Parameters<ApplicationTrackerRepository["transition"]>[0],
  ) {
    await databaseClient().$transaction(async (transaction) => {
      const updated = await transaction.application.updateMany({
        where: {
          id: input.applicationId,
          userId: input.userId,
          state: input.from,
        },
        data: { state: input.to },
      });
      if (updated.count !== 1)
        throw new ConflictError("The application changed before this update.");
      await transaction.applicationEvent.create({
        data: {
          applicationId: input.applicationId,
          actorUserId: input.userId,
          type:
            input.to === "READY"
              ? "READY_FOR_EXTERNAL_SUBMISSION"
              : "STATE_CHANGED",
          fromState: input.from,
          toState: input.to,
          detail: input.detail ? json(input.detail) : undefined,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: input.userId,
          action: "STATUS_CHANGED",
          entityType: "application",
          entityId: input.applicationId,
          metadata: json({ fromState: input.from, toState: input.to }),
        },
      });
    });
  }
}
