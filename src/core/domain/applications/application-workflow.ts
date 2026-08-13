import { ConflictError } from "@/core/errors/application-errors";

export type ApplicationWorkflowStatus =
  | "PENDING"
  | "PROCESSING"
  | "WAITING_REVIEW"
  | "SUBMITTING"
  | "SUBMITTED"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL";

const TRANSITIONS: Readonly<
  Record<ApplicationWorkflowStatus, readonly ApplicationWorkflowStatus[]>
> = {
  PENDING: ["PROCESSING", "FAILED_FINAL"],
  PROCESSING: [
    "WAITING_REVIEW",
    "SUBMITTING",
    "FAILED_RETRYABLE",
    "FAILED_FINAL",
  ],
  WAITING_REVIEW: ["PROCESSING", "FAILED_FINAL"],
  SUBMITTING: ["SUBMITTED", "FAILED_RETRYABLE", "FAILED_FINAL"],
  SUBMITTED: [],
  FAILED_RETRYABLE: ["PROCESSING", "FAILED_FINAL"],
  FAILED_FINAL: [],
};

export function assertWorkflowTransition(
  current: ApplicationWorkflowStatus,
  next: ApplicationWorkflowStatus,
) {
  if (!TRANSITIONS[current].includes(next))
    throw new ConflictError(
      `Invalid workflow transition: ${current} to ${next}.`,
    );
}

export function workflowOutcomeForDecision(
  result: string,
): ApplicationWorkflowStatus {
  if (result === "NEEDS_REVIEW" || result === "RECOMMEND")
    return "WAITING_REVIEW";
  if (result === "REJECT") return "FAILED_FINAL";
  return "SUBMITTING";
}

export function workflowIdempotencyKey(input: {
  readonly decisionId: string;
  readonly userId: string;
}) {
  return `application:${input.userId}:${input.decisionId}`;
}
