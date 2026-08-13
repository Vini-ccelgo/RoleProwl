CREATE TYPE "AuditAction" AS ENUM (
  'CANDIDATE_FACT_VERIFIED',
  'CANDIDATE_FACT_CHANGED',
  'POLICY_CHANGED',
  'APPLICATION_GENERATED',
  'CLAIM_BLOCKED',
  'QUESTION_ANSWERED',
  'REVIEW_APPROVED',
  'APPLICATION_SUBMITTED',
  'SUBMISSION_FAILED',
  'STATUS_CHANGED',
  'ACCOUNT_EXPORT_REQUESTED',
  'ACCOUNT_DELETION_REQUESTED'
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" "AuditAction" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
