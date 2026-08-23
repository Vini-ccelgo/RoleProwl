CREATE TYPE "CandidateFactStatus" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "JobSearchStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

ALTER TYPE "AuditAction" ADD VALUE 'CANDIDATE_FACT_REMOVED';

ALTER TABLE "CandidateFact"
ADD COLUMN "status" "CandidateFactStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "removedAt" TIMESTAMP(3);

CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationUpdates" BOOLEAN NOT NULL DEFAULT true,
    "jobUpdates" BOOLEAN NOT NULL DEFAULT true,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "workflowFailures" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobSearchState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JobSearchStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobSearchState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");
CREATE UNIQUE INDEX "JobSearchState_userId_key" ON "JobSearchState"("userId");
CREATE INDEX "JobSearchState_status_startedAt_idx" ON "JobSearchState"("status", "startedAt");

ALTER TABLE "NotificationPreferences" ADD CONSTRAINT "NotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobSearchState" ADD CONSTRAINT "JobSearchState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
