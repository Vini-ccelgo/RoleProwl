CREATE TYPE "MatchFeedbackRating" AS ENUM ('ACCURATE', 'INACCURATE', 'NOT_RELEVANT');

CREATE TABLE "JobMatchAnalysis" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "qualificationScore" INTEGER NOT NULL,
  "preferenceScore" INTEGER NOT NULL,
  "overallFit" INTEGER NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "hardConflicts" JSONB NOT NULL,
  "strengths" JSONB NOT NULL,
  "partialMatches" JSONB NOT NULL,
  "gaps" JSONB NOT NULL,
  "unknowns" JSONB NOT NULL,
  "scoringVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobMatchAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "signalCode" TEXT NOT NULL,
  "rating" "MatchFeedbackRating" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobMatchAnalysis_userId_jobId_scoringVersion_key" ON "JobMatchAnalysis"("userId", "jobId", "scoringVersion");
CREATE INDEX "JobMatchAnalysis_userId_overallFit_idx" ON "JobMatchAnalysis"("userId", "overallFit");
CREATE UNIQUE INDEX "MatchFeedback_userId_analysisId_signalCode_key" ON "MatchFeedback"("userId", "analysisId", "signalCode");
CREATE INDEX "MatchFeedback_analysisId_idx" ON "MatchFeedback"("analysisId");
ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobMatchAnalysis" ADD CONSTRAINT "JobMatchAnalysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchFeedback" ADD CONSTRAINT "MatchFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchFeedback" ADD CONSTRAINT "MatchFeedback_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "JobMatchAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
