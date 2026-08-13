export type AuthenticationProviderName = "CLERK";

export interface ExternalIdentity {
  readonly provider: AuthenticationProviderName;
  readonly externalId: string;
  readonly email: string | null;
}

export interface UserAccount {
  readonly id: string;
  readonly authProvider: AuthenticationProviderName;
  readonly externalAuthId: string;
  readonly email: string | null;
  readonly deletedAt: Date | null;
}

export interface UserAccountRepository {
  upsertIdentity(identity: ExternalIdentity): Promise<UserAccount>;
  deactivateIdentity(
    provider: AuthenticationProviderName,
    externalId: string,
  ): Promise<void>;
}
