import type { Prisma } from "@/generated/prisma/client";
import type { JobDispositionView } from "@/core/domain/jobs/job-disposition";
import { currentMatchAnalysisWhere } from "./match-query-policy";

export function candidateJobCatalogQuery(
  userId: string,
  view: JobDispositionView,
) {
  const dispositionFilter:
    Prisma.CandidateJobDispositionListRelationFilter | undefined =
    view === "shortlisted"
      ? { some: { userId, status: "SHORTLISTED" as const } }
      : view === "rejected"
        ? { some: { userId, status: "REJECTED" as const } }
        : view === "active"
          ? {
              none: {
                userId,
                status: { in: ["REJECTED", "SHORTLISTED"] },
              },
            }
          : undefined;

  return {
    where: {
      status: "ACTIVE" as const,
      ...(dispositionFilter
        ? { candidateDispositions: dispositionFilter }
        : {}),
    },
    orderBy: { lastSeenAt: "desc" as const },
    take: 50,
    include: {
      sourceRecords: { orderBy: { lastSeenAt: "desc" as const }, take: 1 },
      matchAnalyses: {
        where: currentMatchAnalysisWhere(userId),
        include: { feedback: { where: { userId } } },
        take: 1,
      },
      candidateDispositions: { where: { userId }, take: 1 },
      applications: {
        where: { userId },
        select: { id: true, state: true },
        take: 1,
      },
    },
  } satisfies Prisma.JobFindManyArgs;
}
