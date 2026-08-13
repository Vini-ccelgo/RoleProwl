CREATE TABLE "ApplicationDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inputSnapshot" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "decisionVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationDecision_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReviewQueueItem" ADD COLUMN "applicationDecisionId" TEXT;
CREATE UNIQUE INDEX "ApplicationDecision_userId_jobId_inputHash_decisionVersion_key" ON "ApplicationDecision"("userId", "jobId", "inputHash", "decisionVersion");
CREATE INDEX "ApplicationDecision_userId_createdAt_idx" ON "ApplicationDecision"("userId", "createdAt");
CREATE INDEX "ApplicationDecision_jobId_idx" ON "ApplicationDecision"("jobId");
CREATE UNIQUE INDEX "ReviewQueueItem_applicationDecisionId_key" ON "ReviewQueueItem"("applicationDecisionId");
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationDecision" ADD CONSTRAINT "ApplicationDecision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewQueueItem" ADD CONSTRAINT "ReviewQueueItem_applicationDecisionId_fkey" FOREIGN KEY ("applicationDecisionId") REFERENCES "ApplicationDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
