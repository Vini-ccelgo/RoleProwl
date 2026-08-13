CREATE TYPE "CandidateDocumentFormat" AS ENUM ('PDF', 'DOCX');
CREATE TYPE "CandidateDocumentStatus" AS ENUM ('PROCESSING', 'EXTRACTED', 'EXTRACTION_UNSUPPORTED', 'FAILED');
CREATE TYPE "DocumentExtractionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'EXTRACTION_UNSUPPORTED', 'FAILED');
CREATE TYPE "CandidateFactProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED_AND_ACCEPTED', 'REJECTED');

CREATE TABLE "CandidateDocument" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "format" "CandidateDocumentFormat" NOT NULL,
  "status" "CandidateDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
  "originalFileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentExtraction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "status" "DocumentExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "extractedText" TEXT,
  "characterCount" INTEGER,
  "pageCount" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateFactProposal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "extractionId" TEXT NOT NULL,
  "factType" TEXT NOT NULL,
  "targetPath" TEXT NOT NULL,
  "proposedValue" JSONB NOT NULL,
  "sourceRegion" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION,
  "status" "CandidateFactProposalStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateFactProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateDocument_storageKey_key" ON "CandidateDocument"("storageKey");
CREATE UNIQUE INDEX "CandidateDocument_userId_contentHash_key" ON "CandidateDocument"("userId", "contentHash");
CREATE INDEX "CandidateDocument_userId_createdAt_idx" ON "CandidateDocument"("userId", "createdAt");
CREATE UNIQUE INDEX "DocumentExtraction_documentId_key" ON "DocumentExtraction"("documentId");
CREATE INDEX "DocumentExtraction_userId_idx" ON "DocumentExtraction"("userId");
CREATE INDEX "CandidateFactProposal_userId_status_idx" ON "CandidateFactProposal"("userId", "status");
CREATE INDEX "CandidateFactProposal_documentId_idx" ON "CandidateFactProposal"("documentId");

ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CandidateDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateFactProposal" ADD CONSTRAINT "CandidateFactProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateFactProposal" ADD CONSTRAINT "CandidateFactProposal_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CandidateDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateFactProposal" ADD CONSTRAINT "CandidateFactProposal_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "DocumentExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
