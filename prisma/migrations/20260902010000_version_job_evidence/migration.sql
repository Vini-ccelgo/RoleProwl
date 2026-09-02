-- Existing canonical jobs remain NULL so they are re-normalized before their
-- match analyses can be considered current.
ALTER TABLE "Job" ADD COLUMN "evidenceVersion" TEXT;
