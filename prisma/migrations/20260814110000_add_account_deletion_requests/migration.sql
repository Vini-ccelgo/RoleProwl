CREATE TYPE "AccountDeletionStatus" AS ENUM (
  'PENDING',
  'CLEANUP_REQUIRED',
  'COMPLETE'
);

CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "externalAuthId" TEXT,
  "storageKeys" JSONB NOT NULL,
  "status" "AccountDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "lastErrorCode" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountDeletionRequest_status_createdAt_idx" ON "AccountDeletionRequest"("status", "createdAt");
CREATE INDEX "AccountDeletionRequest_subjectHash_createdAt_idx" ON "AccountDeletionRequest"("subjectHash", "createdAt");
