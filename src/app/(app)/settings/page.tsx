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
  const [auditEvents, productEventCounts] = await Promise.all([
    databaseClient().auditEvent.findMany({
      where: { actorUserId: actor.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    databaseClient().productEvent.groupBy({
      by: ["eventType"],
      where: { userId: actor.id },
      _count: { _all: true },
      orderBy: { eventType: "asc" },
    }),
  ]);
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
            material, including candidate-attributed product events.
          </p>
        </div>
        <a className="button button-secondary w-fit" href="/api/account/export">
          Download my data
        </a>
      </section>
      <section className="card grid gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Product events</h2>
          <p className="m-0 text-sm">
            RoleProwl records only a fixed set of job and application lifecycle
            events. It does not collect page-by-page clickstream, IP addresses,
            device fingerprints, résumé text, answers, or generated prose as
            analytics. Your events are included in export and removed with your
            account.
          </p>
        </div>
        {productEventCounts.length === 0 ? (
          <p className="m-0 text-sm text-foreground-muted">
            No candidate-attributed product events are recorded yet.
          </p>
        ) : (
          <dl className="m-0 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {productEventCounts.map((event) => (
              <div
                className="border-border rounded-xl border p-3"
                key={event.eventType}
              >
                <dt className="text-xs text-foreground-muted">
                  {event.eventType.replaceAll("_", " ").toLowerCase()}
                </dt>
                <dd className="m-0 text-xl font-semibold">
                  {event._count._all}
                </dd>
              </div>
            ))}
          </dl>
        )}
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
