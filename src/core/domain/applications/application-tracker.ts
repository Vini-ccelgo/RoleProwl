import {
  ConflictError,
  ValidationError,
} from "@/core/errors/application-errors";

export const APPLICATION_STATES = [
  "DISCOVERED",
  "SHORTLISTED",
  "PREPARING",
  "NEEDS_REVIEW",
  "READY",
  "SUBMITTING",
  "SUBMITTED",
  "RESPONSE",
  "INTERVIEW",
  "REJECTED",
  "WITHDRAWN",
  "OFFER",
  "CLOSED",
  "FAILED",
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

const TRANSITIONS: Readonly<
  Record<ApplicationState, readonly ApplicationState[]>
> = {
  DISCOVERED: ["SHORTLISTED", "CLOSED"],
  SHORTLISTED: ["PREPARING", "CLOSED"],
  PREPARING: ["NEEDS_REVIEW", "READY", "SUBMITTING", "FAILED"],
  NEEDS_REVIEW: ["PREPARING", "READY", "CLOSED"],
  READY: ["SUBMITTING", "SUBMITTED", "WITHDRAWN", "CLOSED"],
  SUBMITTING: ["SUBMITTED", "FAILED"],
  SUBMITTED: [
    "RESPONSE",
    "INTERVIEW",
    "REJECTED",
    "WITHDRAWN",
    "OFFER",
    "CLOSED",
  ],
  RESPONSE: ["INTERVIEW", "REJECTED", "WITHDRAWN", "OFFER", "CLOSED"],
  INTERVIEW: ["REJECTED", "WITHDRAWN", "OFFER", "CLOSED"],
  REJECTED: ["CLOSED"],
  WITHDRAWN: ["CLOSED"],
  OFFER: ["WITHDRAWN", "CLOSED"],
  CLOSED: [],
  FAILED: ["PREPARING", "CLOSED"],
};

export function isApplicationState(value: string): value is ApplicationState {
  return (APPLICATION_STATES as readonly string[]).includes(value);
}

export function assertApplicationTransition(
  current: ApplicationState,
  next: ApplicationState,
) {
  if (current === next)
    throw new ValidationError("The application is already in that state.");
  if (!TRANSITIONS[current].includes(next))
    throw new ConflictError(
      `Invalid application transition: ${current} to ${next}.`,
    );
}

export function applicationTransitionsFrom(
  state: ApplicationState,
): readonly ApplicationState[] {
  return TRANSITIONS[state];
}

export function trackerOutcome(state: ApplicationState): string | null {
  if (["REJECTED", "WITHDRAWN", "OFFER", "CLOSED"].includes(state))
    return state;
  return null;
}
