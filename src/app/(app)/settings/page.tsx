import { connection } from "next/server";
import { AuditHistory } from "./audit-history";
import { PageHeader } from "@/components/ui/page-header";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import { deleteAccountAction } from "./actions";

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
      <section className="card grid gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Your data</h2>
          <p className="m-0 text-sm">
            Export a portable JSON copy of your RoleProwl-held profile,
            experience, skills, preferences, application history, and generated
            material.
          </p>
        </div>
        <a className="button button-secondary w-fit" href="/api/account/export">
          Download my data
        </a>
      </section>
      <section className="card grid gap-4 border-danger p-5">
        <div>
          <h2 className="text-lg font-semibold">Delete RoleProwl account</h2>
          <p className="m-0 text-sm">
            This permanently removes RoleProwl-held account data and private
            stored documents. It cannot delete applications or personal data
            already transmitted to employers or ATS providers; contact those
            recipients separately.
          </p>
        </div>
        <form action={deleteAccountAction} className="grid max-w-xl gap-3">
          <label className="field">
            <span>Type DELETE ROLEPROWL ACCOUNT</span>
            <input
              autoComplete="off"
              name="confirmation"
              required
              type="text"
            />
          </label>
          <button
            className="button w-fit border-danger text-danger"
            type="submit"
          >
            Permanently delete account
          </button>
        </form>
      </section>
      <AuditHistory events={auditEvents} />
    </div>
  );
}
