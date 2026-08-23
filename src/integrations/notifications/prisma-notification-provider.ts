import "server-only";
import type {
  InternalNotification,
  NotificationProvider,
} from "@/core/contracts/notification-provider";
import { databaseClient } from "@/lib/db/client";
import { notificationAllowed } from "@/features/notifications/notification-preferences";

export class PrismaNotificationProvider implements NotificationProvider {
  async notify(notification: InternalNotification) {
    const database = databaseClient();
    if (
      !(await notificationAllowed(
        database,
        notification.userId,
        notification.type,
      ))
    )
      return;
    await database.notification.upsert({
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
