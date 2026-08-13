"use server";

import { revalidatePath } from "next/cache";
import type { ReviewQueueAction } from "@/core/domain/applications/review-queue";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { mutateReviewQueueItem } from "@/integrations/applications/prisma-review-queue-repository";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";

export async function mutateQueueItemAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const itemId = String(formData.get("itemId") ?? "");
  const action = String(formData.get("action") ?? "") as ReviewQueueAction;
  if (
    !itemId ||
    !(["EDITED", "APPROVED", "REJECTED", "DEFERRED"] as const).includes(action)
  )
    return;
  const deferredText = String(formData.get("deferredUntil") ?? "").trim();
  const deferredUntil = deferredText
    ? new Date(`${deferredText}T12:00:00.000Z`)
    : null;
  await mutateReviewQueueItem({
    action,
    deferredUntil,
    draftText: String(formData.get("draftText") ?? ""),
    itemId,
    note: String(formData.get("note") ?? ""),
    userId: actor.id,
  });
  revalidatePath("/queue");
}
