import type { AuthProvider, AuthenticatedActor } from "@/core/contracts";
import { AuthorizationError } from "@/core/errors/application-errors";
import { requirePrivateBetaAdmission } from "./private-beta-access";

export async function requireAuthenticatedActor(
  provider: AuthProvider,
): Promise<AuthenticatedActor> {
  const actor = await provider.currentActor();
  if (!actor) throw new AuthorizationError("Authentication is required");
  return requirePrivateBetaAdmission(actor);
}
