import "server-only";
import type {
  InternalNotification,
  NotificationProvider,
} from "@/core/contracts/notification-provider";
import { databaseClient } from "@/lib/db/client";

export class PrismaNotificationProvider implements NotificationProvider {
  async notify(notification: InternalNotification) {
    await databaseClient().notification.upsert({
      where: {
        userId_dedupeKey: {
          userId: notification.userId,
          dedupeKey: notification.dedupeKey,
        },
      },
      create: notification,
      update: {},
    });
  }
}
