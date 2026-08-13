"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";

export async function markNotificationReadAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const notificationId = String(formData.get("notificationId") ?? "");
  if (!notificationId) return;
  await databaseClient().notification.updateMany({
    where: { id: notificationId, userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction() {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  await databaseClient().notification.updateMany({
    where: { userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
