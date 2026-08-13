import { connection } from "next/server";
import { AuditHistory } from "./audit-history";
import { PageHeader } from "@/components/ui/page-header";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";

export default async function SettingsPage() {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const auditEvents = await databaseClient().auditEvent.findMany({
    where: { actorUserId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="grid gap-7">
      <PageHeader
        title="Settings and accountability"
        description="Application authority, data controls, and a safe history of consequential system behavior."
      />
      <AuditHistory events={auditEvents} />
    </div>
  );
}
