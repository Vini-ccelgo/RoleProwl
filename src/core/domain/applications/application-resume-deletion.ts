import type { ApplicationState } from "./application-tracker";

const UNAMBIGUOUS_POST_SUBMISSION_STATES = new Set<ApplicationState>([
  "SUBMITTED",
  "RESPONSE",
  "INTERVIEW",
  "REJECTED",
  "OFFER",
]);

export interface ResumeDeletionApplicationState {
  readonly externalConfirmedAt: Date | null;
  readonly externalSubmissionId: string | null;
  readonly state: ApplicationState;
  readonly submittedAt: Date | null;
}

export function applicationHasSubmissionHistory(
  application: ResumeDeletionApplicationState,
) {
  return Boolean(
    application.submittedAt ||
    application.externalConfirmedAt ||
    application.externalSubmissionId ||
    UNAMBIGUOUS_POST_SUBMISSION_STATES.has(application.state),
  );
}

export function applicationIsProtectedFromResumeDeletion(
  application: ResumeDeletionApplicationState,
) {
  return (
    application.state === "SUBMITTING" ||
    applicationHasSubmissionHistory(application)
  );
}
