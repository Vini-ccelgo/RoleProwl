import { AppShell } from "@/components/layout/app-shell";
import { resolveWorkspaceAdmission } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import { syntheticGeminiTestingEnabled } from "@/lib/env/server";
import { redirect } from "next/navigation";

export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admission = await resolveWorkspaceAdmission(currentAuthProvider());
  if (admission.status === "PRIVATE_BETA_DENIED")
    redirect("/?private_beta=restricted");
  if (admission.status === "UNAUTHENTICATED")
    redirect("/sign-in?redirect_url=/dashboard");
  const actor = admission.actor;
  const unreadNotifications = await databaseClient().notification.count({
    where: { userId: actor.id, readAt: null },
  });

  return (
    <AppShell
      actor={actor}
      syntheticAITesting={syntheticGeminiTestingEnabled()}
      unreadNotifications={unreadNotifications}
    >
      {children}
    </AppShell>
  );
}
