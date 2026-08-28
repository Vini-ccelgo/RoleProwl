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
  readonly hasSubmissionConfirmationEvent: boolean;
  readonly state: ApplicationState;
  readonly submittedAt: Date | null;
}

export type ResumeDeletionApplicationClassification =
  "DISPOSABLE_PRE_SUBMISSION" | "RETAINED_SUBMISSION_HISTORY";

export function applicationHasSubmissionHistory(
  application: ResumeDeletionApplicationState,
) {
  return Boolean(
    application.submittedAt ||
    application.externalConfirmedAt ||
    application.externalSubmissionId ||
    application.hasSubmissionConfirmationEvent ||
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

export function classifyApplicationForResumeDeletion(
  application: ResumeDeletionApplicationState,
): ResumeDeletionApplicationClassification {
  return applicationIsProtectedFromResumeDeletion(application)
    ? "RETAINED_SUBMISSION_HISTORY"
    : "DISPOSABLE_PRE_SUBMISSION";
}
