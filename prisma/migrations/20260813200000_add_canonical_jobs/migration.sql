CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'STALE', 'EXPIRED', 'CLOSED');
CREATE TYPE "JobRemoteType" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');

CREATE TABLE "Job" (
  "id" TEXT NOT NULL,
  "canonicalApplicationUrl" TEXT,
  "company" TEXT NOT NULL,
  "normalizedCompany" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "description" TEXT,
  "locations" JSONB,
  "remoteType" "JobRemoteType",
  "employmentType" TEXT,
  "seniority" TEXT,
  "salaryMin" DECIMAL(65,30),
  "salaryMax" DECIMAL(65,30),
  "salaryCurrency" TEXT,
  "salaryInterval" TEXT,
  "requirements" JSONB,
  "preferredRequirements" JSONB,
  "skills" JSONB,
  "educationRequirements" JSONB,
  "experienceRequirements" JSONB,
  "workAuthorization" JSONB,
  "sponsorship" JSONB,
  "postedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "contentHash" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastVerifiedAt" TIMESTAMP(3),
  "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobSourceRecord" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "applicationUrl" TEXT,
  "sourceMetadata" JSONB,
  "rawPayload" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobSourceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Job_normalizedCompany_normalizedTitle_idx" ON "Job"("normalizedCompany", "normalizedTitle");
CREATE INDEX "Job_status_lastSeenAt_idx" ON "Job"("status", "lastSeenAt");
CREATE INDEX "Job_contentHash_idx" ON "Job"("contentHash");
CREATE UNIQUE INDEX "JobSourceRecord_source_externalId_key" ON "JobSourceRecord"("source", "externalId");
CREATE INDEX "JobSourceRecord_jobId_idx" ON "JobSourceRecord"("jobId");
CREATE INDEX "JobSourceRecord_applicationUrl_idx" ON "JobSourceRecord"("applicationUrl");
ALTER TABLE "JobSourceRecord" ADD CONSTRAINT "JobSourceRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
