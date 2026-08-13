CREATE TYPE "AnswerMemorySource" AS ENUM ('PROFILE_FACT', 'COMPUTED_FACT', 'USER_POLICY', 'EXPLICIT_CONSEQUENTIAL');

CREATE TABLE "AnswerMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "source" "AnswerMemorySource" NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "reverifyAfterDays" INTEGER,
    "autoAnswerAllowed" BOOLEAN NOT NULL DEFAULT false,
    "normalizedQuestionExamples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnswerMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnswerMemory_userId_concept_key" ON "AnswerMemory"("userId", "concept");
CREATE INDEX "AnswerMemory_userId_verifiedAt_idx" ON "AnswerMemory"("userId", "verifiedAt");
ALTER TABLE "AnswerMemory" ADD CONSTRAINT "AnswerMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
