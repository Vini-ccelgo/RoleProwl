import { ValidationError } from "@/core/errors/application-errors";

export const AUDIT_ACTIONS = [
  "CANDIDATE_FACT_VERIFIED",
  "CANDIDATE_FACT_CHANGED",
  "POLICY_CHANGED",
  "APPLICATION_GENERATED",
  "CLAIM_BLOCKED",
  "QUESTION_ANSWERED",
  "REVIEW_APPROVED",
  "APPLICATION_SUBMITTED",
  "SUBMISSION_FAILED",
  "STATUS_CHANGED",
  "ACCOUNT_EXPORT_REQUESTED",
  "ACCOUNT_DELETION_REQUESTED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const SAFE_METADATA_KEYS: Readonly<Record<AuditAction, readonly string[]>> = {
  CANDIDATE_FACT_VERIFIED: ["factType", "source"],
  CANDIDATE_FACT_CHANGED: ["factType", "changedFields"],
  POLICY_CHANGED: ["policyVersion", "changedFields"],
  APPLICATION_GENERATED: ["mechanism", "decisionVersion"],
  CLAIM_BLOCKED: ["classification", "reasonCode", "generator"],
  QUESTION_ANSWERED: ["concept", "source", "autoAnswerAllowed"],
  REVIEW_APPROVED: ["reasonCodes"],
  APPLICATION_SUBMITTED: ["mechanism", "confirmation"],
  SUBMISSION_FAILED: ["failureCode", "retryable"],
  STATUS_CHANGED: ["fromState", "toState"],
  ACCOUNT_EXPORT_REQUESTED: ["format", "schemaVersion"],
  ACCOUNT_DELETION_REQUESTED: ["retentionPolicyVersion"],
};

export interface SafeAuditEvent {
  readonly action: AuditAction;
  readonly actorUserId: string | null;
  readonly entityId: string;
  readonly entityType: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

function safeScalarOrArray(value: unknown): boolean {
  if (["string", "number", "boolean"].includes(typeof value)) return true;
  if (value === null) return true;
  return Array.isArray(value) && value.every(safeScalarOrArray);
}

export function buildSafeAuditEvent(input: SafeAuditEvent): SafeAuditEvent {
  if (!input.entityType.trim() || !input.entityId.trim())
    throw new ValidationError("Audit entity is required.");
  const allowed = new Set(SAFE_METADATA_KEYS[input.action]);
  const metadata = Object.fromEntries(
    Object.entries(input.metadata).filter(
      ([key, value]) => allowed.has(key) && safeScalarOrArray(value),
    ),
  );
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    entityType: input.entityType.trim(),
    entityId: input.entityId.trim(),
    metadata,
  };
}
