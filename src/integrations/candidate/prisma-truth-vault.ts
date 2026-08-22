import "server-only";
import { databaseClient } from "@/lib/db/client";

export async function getCandidateTruthVault(userId: string) {
  const database = databaseClient();
  const [
    profile,
    experiences,
    education,
    skills,
    projects,
    credentials,
    verifiedResumeFacts,
    preferences,
    authorization,
  ] = await Promise.all([
    database.candidateProfile.findUnique({ where: { userId } }),
    database.workExperience.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
    }),
    database.education.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
    }),
    database.skill.findMany({
      where: { userId },
      include: { evidence: true },
      orderBy: { canonicalName: "asc" },
    }),
    database.project.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
    }),
    database.credential.findMany({
      where: { userId },
      orderBy: { issuedAt: "desc" },
    }),
    database.candidateFact.findMany({
      where: { userId },
      include: {
        sourceProposal: {
          select: {
            id: true,
            status: true,
            targetPath: true,
            sourceRegion: true,
            document: {
              select: { id: true, originalFileName: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    database.candidatePreferences.findUnique({ where: { userId } }),
    database.workAuthorizationProfile.findUnique({ where: { userId } }),
  ]);

  return {
    profile,
    experiences,
    education,
    skills,
    projects,
    credentials,
    verifiedResumeFacts,
    preferences,
    authorization,
  };
}

export type CandidateTruthVault = Awaited<
  ReturnType<typeof getCandidateTruthVault>
>;
