"use client";

import { useActionState } from "react";
import { saveNotificationPreferencesAction } from "./actions";

const initialState = { status: "idle" as const, message: "" };

export function NotificationPreferencesForm({
  preferences,
}: {
  preferences: {
    applicationUpdates: boolean;
    jobUpdates: boolean;
    reviewRequired: boolean;
    workflowFailures: boolean;
  };
}) {
  const [state, action, pending] = useActionState(
    saveNotificationPreferencesAction,
    initialState,
  );
  const options = [
    [
      "reviewRequired",
      "Review and action required",
      "Applications or questions that need your decision.",
    ],
    [
      "workflowFailures",
      "Workflow failures",
      "Safe-retry exhaustion and blocked workflow outcomes.",
    ],
    [
      "applicationUpdates",
      "Application updates",
      "Confirmed tracked application submissions.",
    ],
    [
      "jobUpdates",
      "Job availability updates",
      "Tracked opportunities that become unavailable.",
    ],
  ] as const;
  return (
    <form action={action} className="grid gap-3">
      {options.map(([name, label, description]) => (
        <label className="preference-toggle" key={name}>
          <input
            defaultChecked={preferences[name]}
            name={name}
            type="checkbox"
          />
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
        </label>
      ))}
      <button
        className="button button-secondary w-fit"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Save notification preferences"}
      </button>
      {state.status !== "idle" && (
        <p className="m-0 text-sm" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
