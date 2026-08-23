import "server-only";
import type { Prisma } from "@/generated/prisma/client";

type PacketInvalidationDatabase = Pick<
  Prisma.TransactionClient,
  "application" | "applicationEvent"
>;

export async function invalidateReadyApplicationPackets(
  database: PacketInvalidationDatabase,
  userId: string,
) {
  const ready = await database.application.findMany({
    where: { userId, state: "READY", submittedAt: null },
    select: { id: true },
  });
  for (const application of ready) {
    const updated = await database.application.updateMany({
      where: {
        id: application.id,
        userId,
        state: "READY",
        submittedAt: null,
      },
      data: { state: "NEEDS_REVIEW" },
    });
    if (updated.count === 1)
      await database.applicationEvent.create({
        data: {
          applicationId: application.id,
          actorUserId: userId,
          type: "PREPARED",
          fromState: "READY",
          toState: "NEEDS_REVIEW",
          detail: { reason: "CANDIDATE_DATA_CHANGED" },
        },
      });
  }
  return ready.length;
}
