import type { PrismaClient } from "@/generated/prisma/client";

type MatchInvalidationDatabase = Pick<PrismaClient, "jobMatchAnalysis">;

export async function invalidateCandidateJobMatchAnalyses(
  database: MatchInvalidationDatabase,
  userId: string,
) {
  await database.jobMatchAnalysis.deleteMany({ where: { userId } });
}

export async function invalidateJobMatchAnalyses(
  database: MatchInvalidationDatabase,
  jobId: string,
) {
  await database.jobMatchAnalysis.deleteMany({ where: { jobId } });
}
