CREATE TYPE "GeneratedClaimClassification" AS ENUM ('DIRECT_FACT', 'SUPPORTED_REWRITE', 'SUPPORTED_INFERENCE', 'UNSUPPORTED');

ALTER TABLE "CandidateFactProposal"
  ADD COLUMN "acceptedValue" JSONB,
  ADD COLUMN "canonicalType" TEXT,
  ADD COLUMN "canonicalId" TEXT;

CREATE TABLE "CandidateFact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "factType" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "verificationState" "VerificationState" NOT NULL DEFAULT 'VERIFIED',
  "source" "FactSource" NOT NULL DEFAULT 'RESUME_EXTRACTED',
  "sourceProposalId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedClaim" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "classification" "GeneratedClaimClassification" NOT NULL,
  "generator" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "assertions" JSONB NOT NULL DEFAULT '[]',
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeneratedClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedClaimEvidence" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "evidenceType" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "evidenceField" TEXT NOT NULL,
  "evidenceSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeneratedClaimEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeneratedClaim_userId_classification_idx" ON "GeneratedClaim"("userId", "classification");
CREATE UNIQUE INDEX "CandidateFact_sourceProposalId_key" ON "CandidateFact"("sourceProposalId");
CREATE INDEX "CandidateFact_userId_factType_idx" ON "CandidateFact"("userId", "factType");
CREATE UNIQUE INDEX "GeneratedClaimEvidence_claimId_evidenceType_evidenceId_evidenceField_key" ON "GeneratedClaimEvidence"("claimId", "evidenceType", "evidenceId", "evidenceField");
CREATE INDEX "GeneratedClaimEvidence_userId_evidenceType_evidenceId_idx" ON "GeneratedClaimEvidence"("userId", "evidenceType", "evidenceId");

ALTER TABLE "GeneratedClaim" ADD CONSTRAINT "GeneratedClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateFact" ADD CONSTRAINT "CandidateFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateFact" ADD CONSTRAINT "CandidateFact_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "CandidateFactProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneratedClaimEvidence" ADD CONSTRAINT "GeneratedClaimEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedClaimEvidence" ADD CONSTRAINT "GeneratedClaimEvidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "GeneratedClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
