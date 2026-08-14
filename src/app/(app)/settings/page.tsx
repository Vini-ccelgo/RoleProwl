import { connection } from "next/server";
import Link from "next/link";
import { AuditHistory } from "./audit-history";
import {
  ApplicationPolicyForm,
  type ApplicationPolicyFormValue,
} from "./application-policy-form";
import { PageHeader } from "@/components/ui/page-header";
import {
  INTEGRATION_SOURCES,
  resolveIntegrationCapability,
} from "@/core/integrations/capability-registry";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import { deleteAccountAction } from "./actions";

export default async function SettingsPage() {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const [auditEvents, productEventCounts, storedPolicy, answerMemories] =
    await Promise.all([
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
      databaseClient().applicationPolicy.findUnique({
        where: { userId: actor.id },
      }),
      databaseClient().answerMemory.findMany({
        where: { userId: actor.id },
        orderBy: { verifiedAt: "desc" },
        select: {
          id: true,
          concept: true,
          source: true,
          verifiedAt: true,
          autoAnswerAllowed: true,
        },
      }),
    ]);
  const policy: ApplicationPolicyFormValue = storedPolicy ?? {
    allowedEmploymentTypes: [],
    allowedLocations: [],
    allowedRoleFamilies: [],
    autonomyLevel: "RECOMMEND_ONLY",
    companyBlacklist: [],
    dailyApplicationLimit: 10,
    excludedSeniorities: [],
    minimumOverallFit: 70,
    rejectAuthorizationConflict: true,
    requireRemote: false,
    salaryMinimum: null,
  };
  return (
    <div className="grid gap-7">
      <PageHeader
        title="Settings and accountability"
        description="Application authority, data controls, and a safe history of consequential system behavior."
      />
      <section className="card grid gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Search preferences</h2>
          <p className="m-0 text-sm">
            Role, location, salary, seniority, travel, and employment
            preferences are canonical candidate data in your Truth Vault.
          </p>
        </div>
        <Link
          className="button button-secondary w-fit"
          href="/profile#preferences"
        >
          Edit search preferences
        </Link>
      </section>
      <section className="card grid gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Application authority</h2>
          <p className="m-0 text-sm">
            These deterministic limits are evaluated before preparation or
            submission. Authorized submission still requires a legitimate source
            integration and an otherwise safe application.
          </p>
        </div>
        <ApplicationPolicyForm policy={policy} />
      </section>
      <section className="card grid gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Application answers</h2>
          <p className="m-0 text-sm">
            Answer memory is concept-based and freshness-limited. Sensitive
            answers and attestations always return to review; saved answer
            values are intentionally not displayed in this summary.
          </p>
        </div>
        {answerMemories.length === 0 ? (
          <p className="m-0 text-sm text-foreground-muted">
            No reusable application answers are stored yet.
          </p>
        ) : (
          <ul className="m-0 grid gap-2 pl-5 text-sm">
            {answerMemories.map((memory) => (
              <li key={memory.id}>
                <strong>{memory.concept.replaceAll("_", " ")}</strong> ·{" "}
                {memory.source.replaceAll("_", " ").toLowerCase()} · verified{" "}
                {memory.verifiedAt.toLocaleDateString()} ·{" "}
                {memory.autoAnswerAllowed
                  ? "auto-answer allowed"
                  : "review only"}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card grid gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Integrations</h2>
          <p className="m-0 text-sm">
            Alpha defaults are shown below. No submission permission is inferred
            from a public job feed.
          </p>
        </div>
        <dl className="m-0 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATION_SOURCES.map((source) => {
            const capability = resolveIntegrationCapability({
              source,
              partnerSubmissionAuthorized: false,
            });
            return (
              <div className="border-border rounded-xl border p-3" key={source}>
                <dt className="font-semibold">{source}</dt>
                <dd className="m-0 text-sm text-foreground-muted">
                  {capability.mode.replaceAll("_", " ").toLowerCase()}
                  {capability.prohibitedAutomation
                    ? " · automation prohibited"
                    : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
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
      <section className="card grid gap-3 p-5">
        <div>
          <h2 className="text-lg font-semibold">Account</h2>
          <p className="m-0 text-sm">
            Signed in as {actor.email ?? "an identity without an email address"}
            . Use the account control in the application header to manage the
            authentication session or sign out. RoleProwl-owned deletion is
            available below.
          </p>
        </div>
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
