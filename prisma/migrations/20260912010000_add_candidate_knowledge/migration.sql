CREATE TYPE "CandidateKnowledgeOrigin" AS ENUM ('EXPLICIT', 'DERIVED');
CREATE TYPE "CandidateNarrativeTheme" AS ENUM ('PROFESSIONAL_CONTEXT', 'RECURRING_DETAILS', 'RECURRING_PREFERENCES');
CREATE TYPE "CandidateKnowledgeProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'CORRECTED', 'DECLINED');

CREATE TABLE "CandidateNarrative" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" "CandidateNarrativeTheme" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CandidateNarrative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateKnowledgeProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "narrativeId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "proposedValue" JSONB NOT NULL,
    "supportingText" TEXT NOT NULL,
    "origin" "CandidateKnowledgeOrigin" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reusable" BOOLEAN NOT NULL DEFAULT true,
    "status" "CandidateKnowledgeProposalStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedValue" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CandidateKnowledgeProposal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AnswerMemory"
  ADD COLUMN "origin" "CandidateKnowledgeOrigin" NOT NULL DEFAULT 'EXPLICIT',
  ADD COLUMN "candidateApproved" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "reusable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sourceNarrativeId" TEXT;

CREATE INDEX "CandidateNarrative_userId_createdAt_idx" ON "CandidateNarrative"("userId", "createdAt");
CREATE INDEX "CandidateKnowledgeProposal_userId_status_idx" ON "CandidateKnowledgeProposal"("userId", "status");
CREATE INDEX "CandidateKnowledgeProposal_narrativeId_idx" ON "CandidateKnowledgeProposal"("narrativeId");

ALTER TABLE "CandidateNarrative" ADD CONSTRAINT "CandidateNarrative_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateKnowledgeProposal" ADD CONSTRAINT "CandidateKnowledgeProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateKnowledgeProposal" ADD CONSTRAINT "CandidateKnowledgeProposal_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "CandidateNarrative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnswerMemory" ADD CONSTRAINT "AnswerMemory_sourceNarrativeId_fkey" FOREIGN KEY ("sourceNarrativeId") REFERENCES "CandidateNarrative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
