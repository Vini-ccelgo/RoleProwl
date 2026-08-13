export interface AuthenticatedActor {
  readonly id: string;
}
export interface AuthProvider {
  currentActor(): Promise<AuthenticatedActor | null>;
}
