CREATE TYPE "ReviewQueueStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DEFERRED');
CREATE TYPE "ReviewQueueAction" AS ENUM ('CREATED', 'EDITED', 'APPROVED', 'REJECTED', 'DEFERRED');

CREATE TABLE "ReviewQueueItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ReviewQueueStatus" NOT NULL DEFAULT 'PENDING',
    "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fitSnapshot" JSONB NOT NULL,
    "applicationMaterials" JSONB NOT NULL,
    "unresolvedQuestions" JSONB NOT NULL,
    "policyResult" TEXT NOT NULL,
    "sourceCapability" JSONB NOT NULL,
    "editableDraft" JSONB,
    "resolutionNote" TEXT,
    "deferredUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewQueueAuditEvent" (
    "id" TEXT NOT NULL,
    "queueItemId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "ReviewQueueAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewQueueAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewQueueItem_userId_status_createdAt_idx" ON "ReviewQueueItem"("userId", "status", "createdAt");
CREATE INDEX "ReviewQueueItem_jobId_idx" ON "ReviewQueueItem"("jobId");
CREATE INDEX "ReviewQueueAuditEvent_queueItemId_createdAt_idx" ON "ReviewQueueAuditEvent"("queueItemId", "createdAt");
CREATE INDEX "ReviewQueueAuditEvent_actorUserId_createdAt_idx" ON "ReviewQueueAuditEvent"("actorUserId", "createdAt");

ALTER TABLE "ReviewQueueItem" ADD CONSTRAINT "ReviewQueueItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewQueueItem" ADD CONSTRAINT "ReviewQueueItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewQueueAuditEvent" ADD CONSTRAINT "ReviewQueueAuditEvent_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "ReviewQueueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewQueueAuditEvent" ADD CONSTRAINT "ReviewQueueAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
