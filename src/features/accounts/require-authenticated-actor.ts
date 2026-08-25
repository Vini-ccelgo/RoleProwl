import type { AuthProvider, AuthenticatedActor } from "@/core/contracts";
import {
  AuthorizationError,
  PrivateBetaAccessError,
} from "@/core/errors/application-errors";
import { requirePrivateBetaAdmission } from "./private-beta-access";

export type WorkspaceAdmission =
  | { readonly status: "ALLOWED"; readonly actor: AuthenticatedActor }
  | { readonly status: "UNAUTHENTICATED" }
  | { readonly status: "PRIVATE_BETA_DENIED" };

export async function resolveWorkspaceAdmission(
  provider: AuthProvider,
): Promise<WorkspaceAdmission> {
  const actor = await provider.currentActor();
  if (!actor) return { status: "UNAUTHENTICATED" };
  try {
    return { status: "ALLOWED", actor: requirePrivateBetaAdmission(actor) };
  } catch (error) {
    if (error instanceof PrivateBetaAccessError)
      return { status: "PRIVATE_BETA_DENIED" };
    throw error;
  }
}

export async function requireAuthenticatedActor(
  provider: AuthProvider,
): Promise<AuthenticatedActor> {
  const admission = await resolveWorkspaceAdmission(provider);
  if (admission.status === "UNAUTHENTICATED")
    throw new AuthorizationError("Authentication is required");
  if (admission.status === "PRIVATE_BETA_DENIED")
    throw new PrivateBetaAccessError();
  return admission.actor;
}
