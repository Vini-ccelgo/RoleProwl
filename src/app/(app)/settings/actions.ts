"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { splitList } from "@/core/domain/candidate/truth-vault";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import type { CandidateFormState } from "@/features/candidate/form-state";
import { deleteAccount } from "@/features/privacy/delete-account";
import { applicationPolicySchema } from "@/features/applications/application-policy-schema";
import { upsertApplicationPolicy } from "@/integrations/applications/prisma-application-policy-repository";
import { ClerkIdentityManager } from "@/integrations/auth/clerk-identity-manager";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { PrismaAccountDeletionRepository } from "@/integrations/privacy/prisma-account-deletion-repository";
import { documentStorage } from "@/integrations/storage/document-storage";

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

export async function deleteAccountAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const result = await deleteAccount({
    userId: actor.id,
    confirmation: String(formData.get("confirmation") ?? ""),
    repository: new PrismaAccountDeletionRepository(),
    storage: documentStorage(),
    identity: new ClerkIdentityManager(),
  });
  redirect(
    result.status === "COMPLETE"
      ? "/?account_deleted=1"
      : "/?account_deletion_pending=1",
  );
}
