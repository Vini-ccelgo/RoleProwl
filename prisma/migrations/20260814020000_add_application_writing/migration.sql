CREATE TYPE "ApplicationWritingType" AS ENUM ('COVER_LETTER', 'MOTIVATION_RESPONSE', 'ROLE_SUMMARY', 'EMPLOYER_FREE_TEXT');

CREATE TABLE "ApplicationWritingArtifact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "type" "ApplicationWritingType" NOT NULL,
    "question" TEXT,
    "content" TEXT NOT NULL,
    "generator" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationWritingArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationWritingClaim" (
    "artifactId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    CONSTRAINT "ApplicationWritingClaim_pkey" PRIMARY KEY ("artifactId", "claimId")
);

CREATE INDEX "ApplicationWritingArtifact_userId_generatedAt_idx" ON "ApplicationWritingArtifact"("userId", "generatedAt");
CREATE INDEX "ApplicationWritingArtifact_targetJobId_type_idx" ON "ApplicationWritingArtifact"("targetJobId", "type");
CREATE INDEX "ApplicationWritingClaim_claimId_idx" ON "ApplicationWritingClaim"("claimId");

ALTER TABLE "ApplicationWritingArtifact" ADD CONSTRAINT "ApplicationWritingArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationWritingArtifact" ADD CONSTRAINT "ApplicationWritingArtifact_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationWritingClaim" ADD CONSTRAINT "ApplicationWritingClaim_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ApplicationWritingArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationWritingClaim" ADD CONSTRAINT "ApplicationWritingClaim_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "GeneratedClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
