import { connection } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { requireWorkspacePageActor } from "@/features/accounts/require-workspace-page-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import { mutateQueueItemAction } from "./actions";

function object(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

function summary(value: Prisma.JsonValue) {
  if (Array.isArray(value))
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  const record = object(value);
  if (!record) return String(value);
  return Object.entries(record)
    .slice(0, 4)
    .map(
      ([key, item]) =>
        `${key}: ${typeof item === "object" ? "recorded" : String(item)}`,
    )
    .join(" · ");
}

function draftText(value: Prisma.JsonValue | null) {
  const draft = object(value);
  return typeof draft?.text === "string" ? draft.text : "";
}

export default async function QueuePage() {
  await connection();
  const actor = await requireWorkspacePageActor(currentAuthProvider());
  const items = await databaseClient().reviewQueueItem.findMany({
    where: { userId: actor.id },
    include: {
      job: { select: { company: true, title: true } },
      auditEvents: { orderBy: { createdAt: "desc" }, take: 8 },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="grid gap-7">
      <PageHeader
        title="Review queue"
        description="Only decisions requiring your attention appear here. Every edit and resolution is retained in the audit history."
      />
      {items.length === 0 ? (
        <div className="card p-8 text-sm text-foreground-muted">
          Nothing needs review. New items appear when policy, evidence,
          questions, or source capability cannot be resolved safely.
        </div>
      ) : (
        <div className="grid gap-5">
          {items.map((item) => {
            const resolved =
              item.status === "APPROVED" || item.status === "REJECTED";
            return (
              <article className="card grid gap-5 p-5" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="m-0 text-xs font-semibold tracking-wide text-brand uppercase">
                      {item.status.replaceAll("_", " ")}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      {item.job.title}
                    </h2>
                    <p className="m-0 text-sm text-foreground-muted">
                      {item.job.company}
                    </p>
                  </div>
                  <span className="badge">Policy: {item.policyResult}</span>
                </div>

                <section className="grid gap-2">
                  <h3 className="text-sm font-semibold">
                    Why attention is required
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {item.reasonCodes.map((reason) => (
                      <span className="badge" key={reason}>
                        {reason.replaceAll("_", " ").toLowerCase()}
                      </span>
                    ))}
                  </div>
                </section>

                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["Fit", item.fitSnapshot],
                    ["Application materials", item.applicationMaterials],
                    ["Unresolved questions", item.unresolvedQuestions],
                    ["Source capability", item.sourceCapability],
                  ].map(([label, value]) => (
                    <section
                      className="border-border rounded-xl border p-3"
                      key={String(label)}
                    >
                      <h3 className="text-sm font-semibold">{String(label)}</h3>
                      <p className="mb-0 text-sm text-foreground-muted">
                        {summary(value as Prisma.JsonValue)}
                      </p>
                    </section>
                  ))}
                </div>

                {!resolved && (
                  <form action={mutateQueueItemAction} className="grid gap-3">
                    <input type="hidden" name="itemId" value={item.id} />
                    <label className="field">
                      <span>Editable draft</span>
                      <textarea
                        name="draftText"
                        defaultValue={draftText(item.editableDraft)}
                      />
                    </label>
                    <label className="field">
                      <span>Decision note</span>
                      <input name="note" placeholder="Optional audit note" />
                    </label>
                    <label className="field max-w-xs">
                      <span>Defer until</span>
                      <input name="deferredUntil" type="date" />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="button button-ghost"
                        name="action"
                        value="EDITED"
                      >
                        Save edit
                      </button>
                      <button
                        className="button button-primary"
                        name="action"
                        value="APPROVED"
                      >
                        Approve
                      </button>
                      <button
                        className="button button-ghost"
                        name="action"
                        value="REJECTED"
                      >
                        Reject
                      </button>
                      <button
                        className="button button-ghost"
                        name="action"
                        value="DEFERRED"
                      >
                        Defer
                      </button>
                    </div>
                  </form>
                )}

                <details>
                  <summary className="cursor-pointer text-sm font-semibold">
                    Audit history ({item.auditEvents.length})
                  </summary>
                  <ol className="grid gap-1 pl-5 text-sm text-foreground-muted">
                    {item.auditEvents.map((event) => (
                      <li key={event.id}>
                        {event.action.toLowerCase()} ·{" "}
                        {event.createdAt.toLocaleString()}
                        {event.note ? ` · ${event.note}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
