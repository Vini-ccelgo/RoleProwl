"use server";

import { revalidatePath } from "next/cache";
import type { PreparedApplication } from "@/core/contracts/application-adapter";
import {
  isApplicationState,
  type ApplicationState,
} from "@/core/domain/applications/application-tracker";
import type { ApplicationSubmissionRecord } from "@/core/domain/applications/submission";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { confirmExternalSubmission } from "@/features/applications/prepare-and-submit-application";
import { updateApplicationState } from "@/features/applications/update-application-state";
import { PrismaApplicationSubmissionRepository } from "@/integrations/applications/prisma-application-submission-repository";
import { PrismaApplicationTrackerRepository } from "@/integrations/applications/prisma-application-tracker-repository";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { PrismaProductAnalyticsProvider } from "@/integrations/analytics/prisma-product-analytics-provider";
import { databaseClient } from "@/lib/db/client";

const USER_OUTCOME_STATES = new Set<ApplicationState>([
  "RESPONSE",
  "INTERVIEW",
  "REJECTED",
  "WITHDRAWN",
  "OFFER",
  "CLOSED",
]);

export async function updateApplicationStateAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  const nextText = String(formData.get("next") ?? "");
  if (
    !applicationId ||
    !isApplicationState(nextText) ||
    !USER_OUTCOME_STATES.has(nextText)
  )
    return;
  await updateApplicationState({
    analytics: new PrismaProductAnalyticsProvider(),
    applicationId,
    userId: actor.id,
    next: nextText,
    detail: { note: String(formData.get("note") ?? "").trim() || null },
    repository: new PrismaApplicationTrackerRepository(),
  });
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
}

export async function confirmExternalApplicationAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return;
  const application = await databaseClient().application.findFirst({
    where: { id: applicationId, userId: actor.id },
    select: {
      id: true,
      userId: true,
      state: true,
      submissionDestination: true,
      submissionMechanism: true,
      submissionPayloadSnapshot: true,
    },
  });
  if (!application || application.state !== "READY") return;
  const record: ApplicationSubmissionRecord = {
    applicationId: application.id,
    userId: application.userId,
    state: "READY",
    destinationUrl: application.submissionDestination,
    mechanism: application.submissionMechanism,
    package:
      application.submissionPayloadSnapshot as unknown as PreparedApplication,
  };
  await confirmExternalSubmission({
    analytics: new PrismaProductAnalyticsProvider(),
    application: record,
    userId: actor.id,
    repository: new PrismaApplicationSubmissionRepository(),
    confirmed: formData.get("confirmed") === "yes",
    confirmedAt: new Date(),
  });
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
}
