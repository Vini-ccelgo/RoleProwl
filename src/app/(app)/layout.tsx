import { AppShell } from "@/components/layout/app-shell";
import { AuthorizationError } from "@/core/errors/application-errors";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { redirect } from "next/navigation";

export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireAuthenticatedActor(currentAuthProvider()).catch(
    (error: unknown) => {
      if (error instanceof AuthorizationError) return null;
      throw error;
    },
  );
  if (!actor) redirect("/sign-in?redirect_url=/dashboard");

  return <AppShell actor={actor}>{children}</AppShell>;
}
