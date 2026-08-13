import type { IdentityManager } from "@/core/contracts/identity-manager";
import type { ObjectStorageProvider } from "@/core/contracts/object-storage-provider";
import { ValidationError } from "@/core/errors/application-errors";

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE ROLEPROWL ACCOUNT";

export interface AccountDeletionRepository {
  begin(input: { readonly userId: string }): Promise<{
    readonly externalAuthId: string;
    readonly requestId: string;
    readonly storageKeys: readonly string[];
  }>;
  deleteRoleProwlData(input: {
    readonly requestId: string;
    readonly userId: string;
  }): Promise<void>;
  markCleanupRequired(input: {
    readonly code: string;
    readonly requestId: string;
  }): Promise<void>;
  markComplete(requestId: string): Promise<void>;
}

export async function deleteAccount(input: {
  readonly confirmation: string;
  readonly identity: IdentityManager;
  readonly repository: AccountDeletionRepository;
  readonly storage: ObjectStorageProvider;
  readonly userId: string;
}) {
  if (input.confirmation !== ACCOUNT_DELETION_CONFIRMATION)
    throw new ValidationError(
      `Type ${ACCOUNT_DELETION_CONFIRMATION} to confirm account deletion.`,
    );
  const request = await input.repository.begin({ userId: input.userId });
  try {
    await Promise.all(
      request.storageKeys.map((key) => input.storage.delete(key)),
    );
    await input.identity.deleteIdentity(request.externalAuthId);
    await input.repository.deleteRoleProwlData({
      userId: input.userId,
      requestId: request.requestId,
    });
    await input.repository.markComplete(request.requestId);
    return { status: "COMPLETE" as const };
  } catch {
    await input.repository.markCleanupRequired({
      requestId: request.requestId,
      code: "EXTERNAL_CLEANUP_REQUIRED",
    });
    return { status: "CLEANUP_REQUIRED" as const };
  }
}
