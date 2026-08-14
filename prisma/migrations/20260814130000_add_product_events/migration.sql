CREATE TYPE "ProductEventType" AS ENUM ('JOB_DISCOVERED', 'JOB_VIEWED', 'JOB_SHORTLISTED', 'JOB_REJECTED', 'APPLICATION_PREPARED', 'REVIEW_REQUESTED', 'APPLICATION_SUBMITTED', 'RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER');
CREATE TYPE "CandidateJobDispositionStatus" AS ENUM ('SHORTLISTED', 'REJECTED');

CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" "ProductEventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "properties" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductEvent_dedupeKey_key" ON "ProductEvent"("dedupeKey");
CREATE INDEX "ProductEvent_userId_occurredAt_idx" ON "ProductEvent"("userId", "occurredAt");
CREATE INDEX "ProductEvent_eventType_occurredAt_idx" ON "ProductEvent"("eventType", "occurredAt");

ALTER TABLE "ProductEvent" ADD CONSTRAINT "ProductEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CandidateJobDisposition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "CandidateJobDispositionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateJobDisposition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateJobDisposition_userId_jobId_key" ON "CandidateJobDisposition"("userId", "jobId");
CREATE INDEX "CandidateJobDisposition_userId_status_updatedAt_idx" ON "CandidateJobDisposition"("userId", "status", "updatedAt");

ALTER TABLE "CandidateJobDisposition" ADD CONSTRAINT "CandidateJobDisposition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateJobDisposition" ADD CONSTRAINT "CandidateJobDisposition_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
