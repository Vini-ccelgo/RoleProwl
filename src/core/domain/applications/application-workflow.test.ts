import { describe, expect, it } from "vitest";
import { ConflictError } from "@/core/errors/application-errors";
import {
  assertWorkflowTransition,
  workflowIdempotencyKey,
  workflowOutcomeForDecision,
} from "./application-workflow";

describe("application workflow state", () => {
  it.each([
    ["PENDING", "PROCESSING"],
    ["PROCESSING", "WAITING_REVIEW"],
    ["PROCESSING", "SUBMITTING"],
    ["SUBMITTING", "SUBMITTED"],
    ["PROCESSING", "FAILED_RETRYABLE"],
    ["FAILED_RETRYABLE", "PROCESSING"],
  ] as const)("permits %s to %s", (current, next) => {
    expect(() => assertWorkflowTransition(current, next)).not.toThrow();
  });

  it.each([
    ["SUBMITTED", "PROCESSING"],
    ["FAILED_FINAL", "PROCESSING"],
    ["PENDING", "SUBMITTED"],
    ["WAITING_REVIEW", "SUBMITTED"],
  ] as const)("rejects %s to %s", (current, next) => {
    expect(() => assertWorkflowTransition(current, next)).toThrow(
      ConflictError,
    );
  });

  it("maps decision results to durable next states", () => {
    expect(workflowOutcomeForDecision("NEEDS_REVIEW")).toBe("WAITING_REVIEW");
    expect(workflowOutcomeForDecision("REJECT")).toBe("FAILED_FINAL");
    expect(workflowOutcomeForDecision("AUTO_PREPARE")).toBe("SUBMITTING");
  });

  it("derives a stable user-and-decision idempotency key", () => {
    expect(workflowIdempotencyKey({ userId: "u1", decisionId: "d1" })).toBe(
      "application:u1:d1",
    );
  });
});
