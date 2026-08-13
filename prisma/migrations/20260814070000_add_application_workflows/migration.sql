CREATE TYPE "ApplicationWorkflowStatus" AS ENUM ('PENDING', 'PROCESSING', 'WAITING_REVIEW', 'SUBMITTING', 'SUBMITTED', 'FAILED_RETRYABLE', 'FAILED_FINAL');

CREATE TABLE "ApplicationWorkflowRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ApplicationWorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApplicationWorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationWorkflowRun_idempotencyKey_key" ON "ApplicationWorkflowRun"("idempotencyKey");
CREATE INDEX "ApplicationWorkflowRun_userId_status_createdAt_idx" ON "ApplicationWorkflowRun"("userId", "status", "createdAt");
CREATE INDEX "ApplicationWorkflowRun_decisionId_idx" ON "ApplicationWorkflowRun"("decisionId");
ALTER TABLE "ApplicationWorkflowRun" ADD CONSTRAINT "ApplicationWorkflowRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationWorkflowRun" ADD CONSTRAINT "ApplicationWorkflowRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationWorkflowRun" ADD CONSTRAINT "ApplicationWorkflowRun_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ApplicationDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
