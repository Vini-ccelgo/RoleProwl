import "server-only";
import type {
  AnalyticsProvider,
  ProductEventInput,
} from "@/core/contracts/analytics-provider";
import { prepareProductEvent } from "@/core/domain/analytics/product-event";
import type { Prisma } from "@/generated/prisma/client";
import { databaseClient } from "@/lib/db/client";

export class PrismaProductAnalyticsProvider implements AnalyticsProvider {
  async track(input: ProductEventInput) {
    const event = prepareProductEvent(input);
    await databaseClient().productEvent.upsert({
      where: { dedupeKey: event.dedupeKey },
      create: {
        userId: event.userId,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        dedupeKey: event.dedupeKey,
        properties: event.properties as Prisma.InputJsonValue,
        occurredAt: event.occurredAt,
      },
      update: {},
    });
  }
}
