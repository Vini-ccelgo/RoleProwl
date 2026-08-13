import type { Prisma } from "@/generated/prisma/client";

function summary(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value)
    .map(
      ([key, item]) =>
        `${key.replaceAll("_", " ")}: ${Array.isArray(item) ? item.join(", ") : String(item)}`,
    )
    .join(" · ");
}

export function AuditHistory({
  events,
}: {
  events: readonly {
    readonly action: string;
    readonly createdAt: Date;
    readonly entityType: string;
    readonly id: string;
    readonly metadata: Prisma.JsonValue;
  }[];
}) {
  return (
    <section className="card grid gap-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">Audit history</h2>
        <p className="m-0 text-sm">
          Consequential RoleProwl actions with content-minimized metadata.
        </p>
      </div>
      {events.length === 0 ? (
        <p className="m-0 text-sm">
          No consequential actions are recorded yet.
        </p>
      ) : (
        <ol className="m-0 grid gap-3 pl-5 text-sm">
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.action.replaceAll("_", " ").toLowerCase()}</strong>
              {" · "}
              {event.entityType}
              {" · "}
              <time dateTime={event.createdAt.toISOString()}>
                {event.createdAt.toLocaleString()}
              </time>
              {summary(event.metadata) && (
                <p className="m-0 text-sm">{summary(event.metadata)}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
