"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { deleteAccount } from "@/features/privacy/delete-account";
import { ClerkIdentityManager } from "@/integrations/auth/clerk-identity-manager";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { PrismaAccountDeletionRepository } from "@/integrations/privacy/prisma-account-deletion-repository";
import { documentStorage } from "@/integrations/storage/development-filesystem-storage";

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
