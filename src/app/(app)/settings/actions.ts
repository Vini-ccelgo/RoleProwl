"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { splitList } from "@/core/domain/candidate/truth-vault";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import type { CandidateFormState } from "@/features/candidate/form-state";
import { applicationPolicySchema } from "@/features/applications/application-policy-schema";
import { upsertApplicationPolicy } from "@/integrations/applications/prisma-application-policy-repository";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export async function saveApplicationPolicyAction(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const salary = text(formData, "salaryMinimum").trim();
    const value = applicationPolicySchema.parse({
      allowedRoleFamilies: splitList(text(formData, "allowedRoleFamilies")),
      minimumOverallFit: Number(text(formData, "minimumOverallFit")),
      excludedSeniorities: splitList(text(formData, "excludedSeniorities")),
      salaryMinimum: salary ? Number(salary) : null,
      allowedLocations: splitList(text(formData, "allowedLocations")),
      requireRemote: formData.get("requireRemote") === "on",
      allowedEmploymentTypes: splitList(
        text(formData, "allowedEmploymentTypes"),
      ),
      rejectAuthorizationConflict:
        formData.get("rejectAuthorizationConflict") === "on",
      companyBlacklist: splitList(text(formData, "companyBlacklist")),
      dailyApplicationLimit: Number(text(formData, "dailyApplicationLimit")),
      autonomyLevel: text(formData, "autonomyLevel"),
    });
    await upsertApplicationPolicy(actor.id, value);
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { status: "success", message: "Application policy saved." };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Invalid policy value.")
          : "The application policy could not be saved.",
    };
  }
}

export async function saveNotificationPreferencesAction(
  _state: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const preferences = {
      applicationUpdates: formData.get("applicationUpdates") === "on",
      jobUpdates: formData.get("jobUpdates") === "on",
      reviewRequired: formData.get("reviewRequired") === "on",
      workflowFailures: formData.get("workflowFailures") === "on",
    };
    await databaseClient().notificationPreferences.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, ...preferences },
      update: preferences,
    });
    revalidatePath("/settings");
    return { status: "success", message: "Notification preferences saved." };
  } catch {
    return {
      status: "error",
      message: "Notification preferences could not be saved. Please retry.",
    };
  }
}
