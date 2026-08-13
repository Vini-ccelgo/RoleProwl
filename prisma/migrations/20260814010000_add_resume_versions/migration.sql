CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "generator" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "renderedStorageKey" TEXT NOT NULL,
    "renderedFileName" TEXT NOT NULL,
    "renderedContentType" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResumeVersionClaim" (
    "resumeVersionId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    CONSTRAINT "ResumeVersionClaim_pkey" PRIMARY KEY ("resumeVersionId", "claimId")
);

CREATE UNIQUE INDEX "ResumeVersion_renderedStorageKey_key" ON "ResumeVersion"("renderedStorageKey");
CREATE INDEX "ResumeVersion_userId_generatedAt_idx" ON "ResumeVersion"("userId", "generatedAt");
CREATE INDEX "ResumeVersion_targetJobId_idx" ON "ResumeVersion"("targetJobId");
CREATE INDEX "ResumeVersionClaim_claimId_idx" ON "ResumeVersionClaim"("claimId");

ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResumeVersionClaim" ADD CONSTRAINT "ResumeVersionClaim_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResumeVersionClaim" ADD CONSTRAINT "ResumeVersionClaim_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "GeneratedClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
