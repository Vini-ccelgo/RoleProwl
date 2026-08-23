import type { ApplicationState } from "@/core/domain/applications/application-tracker";

export const APPLICATION_OUTCOME_POLICY_COPY =
  "RoleProwl does not guess application outcomes.";

export function applicationStateLabel(state: ApplicationState) {
  const labels: Record<ApplicationState, string> = {
    DISCOVERED: "Discovered",
    SHORTLISTED: "Shortlisted",
    PREPARING: "Preparing",
    NEEDS_REVIEW: "Needs review",
    READY: "Ready for employer submission",
    SUBMITTING: "Submitting",
    SUBMITTED: "Submitted",
    RESPONSE: "Employer response",
    INTERVIEW: "Interview",
    REJECTED: "Rejected by employer",
    WITHDRAWN: "Withdrawn by you",
    OFFER: "Offer",
    CLOSED: "Closed",
    FAILED: "Preparation failed",
  };
  return labels[state];
}

export function applicationNextAction(state: ApplicationState) {
  if (state === "PREPARING" || state === "NEEDS_REVIEW")
    return "Review preparation";
  if (state === "READY") return "Open employer application";
  if (state === "SUBMITTED" || state === "RESPONSE" || state === "INTERVIEW")
    return "Record a confirmed outcome";
  if (state === "FAILED") return "Review preparation failure";
  return "View durable record";
}

export function applicationEventLabel(type: string) {
  const labels: Readonly<Record<string, string>> = {
    PREPARED: "Application materials prepared",
    READY_FOR_EXTERNAL_SUBMISSION: "Ready for employer submission",
    SUBMISSION_STARTED: "Submission started",
    SUBMISSION_CONFIRMED: "Submission confirmed",
    SUBMISSION_FAILED: "Submission failed",
    STATE_CHANGED: "Application state updated",
  };
  return labels[type] ?? type.replaceAll("_", " ").toLowerCase();
}
