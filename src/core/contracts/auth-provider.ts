export interface AuthenticatedActor {
  readonly id: string;
  readonly externalId: string;
  readonly email: string | null;
}

export interface AuthProvider {
  currentActor(): Promise<AuthenticatedActor | null>;
}
