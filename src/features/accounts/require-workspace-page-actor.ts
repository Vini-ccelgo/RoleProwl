import { redirect } from "next/navigation";
import type { AuthProvider, AuthenticatedActor } from "@/core/contracts";
import { resolveWorkspaceAdmission } from "./require-authenticated-actor";

export async function requireWorkspacePageActor(
  provider: AuthProvider,
): Promise<AuthenticatedActor> {
  const admission = await resolveWorkspaceAdmission(provider);
  if (admission.status === "PRIVATE_BETA_DENIED")
    redirect("/?private_beta=restricted");
  if (admission.status === "UNAUTHENTICATED")
    redirect("/sign-in?redirect_url=/dashboard");
  return admission.actor;
}
