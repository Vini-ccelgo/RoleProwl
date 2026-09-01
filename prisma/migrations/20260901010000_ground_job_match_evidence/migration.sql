-- RP-034D separates score availability, evidence coverage, and conflicts.
-- Existing versioned analyses remain historical; match-v1.2 writes every new
-- non-null field and may leave a score null when coverage is insufficient.
ALTER TABLE "JobMatchAnalysis"
  ALTER COLUMN "qualificationScore" DROP NOT NULL,
  ALTER COLUMN "preferenceScore" DROP NOT NULL,
  ALTER COLUMN "overallFit" DROP NOT NULL,
  ADD COLUMN "evidenceCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "conflicts" JSONB NOT NULL DEFAULT '[]';
