CREATE TYPE "JobSourceHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'UNAVAILABLE');

CREATE TABLE "JobSourceHealth" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" "JobSourceHealthStatus" NOT NULL DEFAULT 'HEALTHY',
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "nextRetryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobSourceHealth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobSourceHealth_source_key" ON "JobSourceHealth"("source");
