export interface IdentityManager {
  deleteIdentity(externalId: string): Promise<void>;
}
