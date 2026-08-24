import { AppShell } from "@/components/layout/app-shell";
import {
  AuthorizationError,
  PrivateBetaAccessError,
} from "@/core/errors/application-errors";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import { syntheticGeminiTestingEnabled } from "@/lib/env/server";
import { redirect } from "next/navigation";

export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireAuthenticatedActor(currentAuthProvider()).catch(
    (error: unknown) => {
      if (error instanceof PrivateBetaAccessError) return "PRIVATE_BETA_DENIED";
      if (error instanceof AuthorizationError) return null;
      throw error;
    },
  );
  if (actor === "PRIVATE_BETA_DENIED") redirect("/?private_beta=restricted");
  if (!actor) redirect("/sign-in?redirect_url=/dashboard");
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
