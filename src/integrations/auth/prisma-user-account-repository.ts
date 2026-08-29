import "server-only";
import type {
  AuthenticationProviderName,
  ExternalIdentity,
  UserAccount,
  UserAccountRepository,
} from "@/core/contracts";
import { databaseClient } from "@/lib/db/client";

export class PrismaUserAccountRepository implements UserAccountRepository {
  async upsertIdentity(identity: ExternalIdentity): Promise<UserAccount> {
    const user = await databaseClient().user.upsert({
      where: {
        authProvider_externalAuthId: {
          authProvider: identity.provider,
          externalAuthId: identity.externalId,
        },
      },
      create: {
        authProvider: identity.provider,
        externalAuthId: identity.externalId,
        email: identity.email,
      },
      update: { email: identity.email, deletedAt: null },
    });

    return {
      ...user,
      authProvider: user.authProvider as AuthenticationProviderName,
    };
  }

  async refreshActiveIdentity(identity: ExternalIdentity): Promise<void> {
    await databaseClient().user.updateMany({
      where: {
        authProvider: identity.provider,
        externalAuthId: identity.externalId,
        deletedAt: null,
      },
      data: { email: identity.email },
    });
  }

  async deactivateIdentity(
    provider: AuthenticationProviderName,
    externalId: string,
  ): Promise<void> {
    await databaseClient().user.updateMany({
      where: { authProvider: provider, externalAuthId: externalId },
      data: { email: null, deletedAt: new Date() },
    });
  }
}
