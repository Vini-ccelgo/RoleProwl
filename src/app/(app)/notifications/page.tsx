import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { databaseClient } from "@/lib/db/client";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";

function destination(entityType: string | null, entityId: string | null) {
  if (entityType === "application" && entityId)
    return `/applications/${entityId}`;
  if (entityType === "reviewQueueItem") return "/queue";
  if (entityType === "job") return "/jobs";
  return "/applications";
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export default async function NotificationsPage() {
  await connection();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const notifications = await databaseClient().notification.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter(({ readAt }) => !readAt).length;

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Notifications"
          description="First-party updates that require attention or record consequential application activity."
        />
        {unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button className="button button-secondary" type="submit">
              Mark all read
            </button>
          </form>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className="card p-8 text-sm text-foreground-muted">
          No notifications. Review requests, workflow failures, unavailable
          jobs, and confirmed submissions will appear here.
        </div>
      ) : (
        <ol className="m-0 grid list-none gap-3 p-0">
          {notifications.map((notification) => (
            <li
              className={`card grid gap-3 p-5 sm:grid-cols-[1fr_auto] ${notification.readAt ? "opacity-70" : "border-brand"}`}
              key={notification.id}
            >
              <div>
                <span className="badge">{label(notification.type)}</span>
                <h2 className="mt-3 text-base font-semibold">
                  <Link
                    href={destination(
                      notification.entityType,
                      notification.entityId,
                    )}
                  >
                    {notification.title}
                  </Link>
                </h2>
                <p className="m-0 text-sm">{notification.body}</p>
                <time
                  className="text-xs text-foreground-muted"
                  dateTime={notification.createdAt.toISOString()}
                >
                  {notification.createdAt.toLocaleString()}
                </time>
              </div>
              {!notification.readAt && (
                <form action={markNotificationReadAction}>
                  <input
                    name="notificationId"
                    type="hidden"
                    value={notification.id}
                  />
                  <button className="button button-ghost" type="submit">
                    Mark read
                  </button>
                </form>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
