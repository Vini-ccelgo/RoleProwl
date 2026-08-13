import type {
  InternalNotification,
  NotificationProvider,
} from "@/core/contracts/notification-provider";
import { ValidationError } from "@/core/errors/application-errors";

const MAX_TITLE = 120;
const MAX_BODY = 500;

export async function sendInternalNotification(input: {
  readonly notification: InternalNotification;
  readonly provider: NotificationProvider;
}) {
  const title = input.notification.title.trim();
  const body = input.notification.body.trim();
  if (!title || title.length > MAX_TITLE)
    throw new ValidationError("Notification title is invalid.");
  if (!body || body.length > MAX_BODY)
    throw new ValidationError("Notification body is invalid.");
  if (!input.notification.dedupeKey.trim())
    throw new ValidationError("Notification dedupe key is required.");
  await input.provider.notify({ ...input.notification, title, body });
}
