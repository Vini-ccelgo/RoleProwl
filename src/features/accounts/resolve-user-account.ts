import type {
  AuthenticatedActor,
  ExternalIdentity,
  UserAccountRepository,
} from "@/core/contracts";
import {
  NotFoundError,
  ValidationError,
} from "@/core/errors/application-errors";

export async function resolveUserAccount(
  identity: ExternalIdentity,
  repository: UserAccountRepository,
): Promise<AuthenticatedActor> {
  if (!identity.externalId.trim()) {
    throw new ValidationError("External authentication identity is required");
  }

  const account = await repository.upsertIdentity(identity);
  return {
    id: account.id,
    externalId: account.externalAuthId,
    email: account.email,
  };
}

export function assertOwnedResource(actorId: string, ownerId: string): void {
  if (actorId !== ownerId) {
    // Deliberately conceal whether another user's resource exists.
    throw new NotFoundError();
  }
}
