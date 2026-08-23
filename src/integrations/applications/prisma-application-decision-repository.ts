import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ApplicationDecisionRepository } from "@/features/applications/decide-and-record-application";
import { databaseClient } from "@/lib/db/client";
import { notificationAllowed } from "@/features/notifications/notification-preferences";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class PrismaApplicationDecisionRepository implements ApplicationDecisionRepository {
  async save(input: Parameters<ApplicationDecisionRepository["save"]>[0]) {
    return databaseClient().$transaction(async (transaction) => {
      const decision = await transaction.applicationDecision.upsert({
        where: {
          userId_jobId_inputHash_decisionVersion: {
            userId: input.input.userId,
            jobId: input.input.job.id,
            inputHash: input.decision.inputHash,
            decisionVersion: input.decision.decisionVersion,
          },
        },
        create: {
          userId: input.input.userId,
          jobId: input.input.job.id,
          result: input.decision.result,
          reasonCodes: [...input.decision.reasons],
          inputSnapshot: json(input.input),
          inputHash: input.decision.inputHash,
          policyVersion: "application-policy-v1",
          decisionVersion: input.decision.decisionVersion,
        },
        update: {},
      });
      if (!input.queueSnapshot)
        return { id: decision.id, reviewQueueItemId: null };
      const existing = await transaction.reviewQueueItem.findUnique({
        where: { applicationDecisionId: decision.id },
        select: { id: true },
      });
      if (existing) return { id: decision.id, reviewQueueItemId: existing.id };
      const queue = await transaction.reviewQueueItem.create({
        data: {
          userId: input.input.userId,
          jobId: input.input.job.id,
          applicationDecisionId: decision.id,
          reasonCodes: [...input.queueSnapshot.reasonCodes],
          fitSnapshot: json(input.queueSnapshot.fitSnapshot),
          applicationMaterials: json(input.queueSnapshot.applicationMaterials),
          unresolvedQuestions: json(input.queueSnapshot.unresolvedQuestions),
          policyResult: input.queueSnapshot.policyResult,
          sourceCapability: json(input.queueSnapshot.sourceCapability),
        },
      });
      await transaction.reviewQueueAuditEvent.create({
        data: {
          queueItemId: queue.id,
          actorUserId: input.input.userId,
          action: "CREATED",
          after: json({ status: queue.status, reasonCodes: queue.reasonCodes }),
          note: "Created by application-decision-v1",
        },
      });
      if (
        await notificationAllowed(
          transaction,
          input.input.userId,
          "APPLICATION_NEEDS_REVIEW",
        )
      )
        await transaction.notification.upsert({
          where: {
            userId_dedupeKey: {
              userId: input.input.userId,
              dedupeKey: `review:${queue.id}`,
            },
          },
          create: {
            userId: input.input.userId,
            type: "APPLICATION_NEEDS_REVIEW",
            title: "Application needs review",
            body: "An application decision needs your attention before it can continue.",
            entityType: "reviewQueueItem",
            entityId: queue.id,
            dedupeKey: `review:${queue.id}`,
          },
          update: {},
        });
      if (
        Array.isArray(input.queueSnapshot.unresolvedQuestions) &&
        input.queueSnapshot.unresolvedQuestions.length > 0
      )
        if (
          await notificationAllowed(
            transaction,
            input.input.userId,
            "QUESTION_NEEDS_ANSWER",
          )
        )
          await transaction.notification.upsert({
            where: {
              userId_dedupeKey: {
                userId: input.input.userId,
                dedupeKey: `questions:${queue.id}`,
              },
            },
            create: {
              userId: input.input.userId,
              type: "QUESTION_NEEDS_ANSWER",
              title: "Application question needs an answer",
              body: "One or more application questions require your direct answer or confirmation.",
              entityType: "reviewQueueItem",
              entityId: queue.id,
              dedupeKey: `questions:${queue.id}`,
            },
            update: {},
          });
      return { id: decision.id, reviewQueueItemId: queue.id };
    });
  }
}
