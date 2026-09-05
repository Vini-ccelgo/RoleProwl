import { atomizeVerifiedSkillText } from "@/core/domain/candidate/skill-text-atomization";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { invalidateCandidateJobMatchAnalyses } from "@/integrations/jobs/invalidate-job-match-analyses";

export const CANDIDATE_FACT_SKILL_EVIDENCE_TYPE = "CANDIDATE_FACT";

export interface CandidateSkillSynchronizationResult {
  readonly changed: boolean;
  readonly createdEvidenceCount: number;
  readonly createdSkillCount: number;
  readonly deletedEvidenceCount: number;
  readonly deletedSkillCount: number;
  readonly updatedEvidenceCount: number;
}

function factText(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? typeof (value as { text?: unknown }).text === "string"
      ? (value as { text: string }).text
      : null
    : null;
}

export async function synchronizeVerifiedCandidateSkills(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<CandidateSkillSynchronizationResult> {
  const [facts, currentSkills, currentEvidence] = await Promise.all([
    transaction.candidateFact.findMany({
      where: {
        factType: "SKILL_TEXT",
        source: "RESUME_EXTRACTED",
        status: "ACTIVE",
        userId,
        verificationState: "VERIFIED",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, value: true },
    }),
    transaction.skill.findMany({
      where: { userId },
      select: {
        canonicalName: true,
        evidence: {
          where: { verificationState: "VERIFIED" },
          select: { evidenceType: true },
        },
        id: true,
        normalizedName: true,
        source: true,
      },
    }),
    transaction.candidateSkillEvidence.findMany({
      where: {
        evidenceType: CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
        userId,
      },
      select: {
        description: true,
        evidenceId: true,
        id: true,
        skill: { select: { normalizedName: true } },
        skillId: true,
        source: true,
        verificationState: true,
      },
    }),
  ]);

  const desired = new Map<
    string,
    {
      readonly canonicalName: string;
      readonly description: string;
      readonly evidenceId: string;
      readonly normalizedName: string;
    }
  >();
  for (const fact of facts) {
    const description = factText(fact.value);
    if (!description) continue;
    for (const atom of atomizeVerifiedSkillText(fact.value)) {
      desired.set(`${atom.normalizedName}\u0000${fact.id}`, {
        ...atom,
        description,
        evidenceId: fact.id,
      });
    }
  }

  const skillsByName = new Map(
    currentSkills.map((skill) => [skill.normalizedName, skill]),
  );
  const evidenceByKey = new Map(
    currentEvidence.map((evidence) => [
      `${evidence.skill.normalizedName}\u0000${evidence.evidenceId}`,
      evidence,
    ]),
  );
  let createdSkillCount = 0;
  let createdEvidenceCount = 0;
  let updatedEvidenceCount = 0;

  for (const [key, atom] of desired) {
    let skill = skillsByName.get(atom.normalizedName);
    if (!skill) {
      skill = await transaction.skill.upsert({
        where: {
          userId_normalizedName: {
            normalizedName: atom.normalizedName,
            userId,
          },
        },
        create: {
          canonicalName: atom.canonicalName,
          normalizedName: atom.normalizedName,
          source: "RESUME_EXTRACTED",
          userId,
          verificationState: "VERIFIED",
        },
        update: {},
        select: {
          canonicalName: true,
          evidence: {
            where: { verificationState: "VERIFIED" },
            select: { evidenceType: true },
          },
          id: true,
          normalizedName: true,
          source: true,
        },
      });
      skillsByName.set(atom.normalizedName, skill);
      createdSkillCount += 1;
    }

    const evidence = evidenceByKey.get(key);
    if (!evidence) {
      await transaction.candidateSkillEvidence.upsert({
        where: {
          skillId_evidenceType_evidenceId: {
            evidenceId: atom.evidenceId,
            evidenceType: CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
            skillId: skill.id,
          },
        },
        create: {
          description: atom.description,
          evidenceId: atom.evidenceId,
          evidenceType: CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
          skillId: skill.id,
          source: "RESUME_EXTRACTED",
          userId,
          verificationState: "VERIFIED",
        },
        update: {
          description: atom.description,
          source: "RESUME_EXTRACTED",
          verificationState: "VERIFIED",
        },
      });
      createdEvidenceCount += 1;
      continue;
    }

    if (
      evidence.description !== atom.description ||
      evidence.source !== "RESUME_EXTRACTED" ||
      evidence.verificationState !== "VERIFIED"
    ) {
      await transaction.candidateSkillEvidence.updateMany({
        where: { id: evidence.id, userId },
        data: {
          description: atom.description,
          source: "RESUME_EXTRACTED",
          verificationState: "VERIFIED",
        },
      });
      updatedEvidenceCount += 1;
    }
  }

  const staleEvidenceIds = currentEvidence
    .filter(
      (evidence) =>
        !desired.has(
          `${evidence.skill.normalizedName}\u0000${evidence.evidenceId}`,
        ),
    )
    .map(({ id }) => id);
  const deletedEvidenceCount = staleEvidenceIds.length
    ? (
        await transaction.candidateSkillEvidence.deleteMany({
          where: { id: { in: staleEvidenceIds }, userId },
        })
      ).count
    : 0;
  const desiredSkillNames = new Set(
    [...desired.values()].map(({ normalizedName }) => normalizedName),
  );
  const unsupportedDerivedSkillIds = currentSkills
    .filter(
      (skill) =>
        skill.source === "RESUME_EXTRACTED" &&
        !desiredSkillNames.has(skill.normalizedName) &&
        !skill.evidence.some(
          ({ evidenceType }) =>
            evidenceType !== CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
        ),
    )
    .map(({ id }) => id);
  const deletedSkillCount = unsupportedDerivedSkillIds.length
    ? (
        await transaction.skill.deleteMany({
          where: {
            id: { in: unsupportedDerivedSkillIds },
            source: "RESUME_EXTRACTED",
            userId,
          },
        })
      ).count
    : 0;

  return {
    changed:
      createdSkillCount > 0 ||
      createdEvidenceCount > 0 ||
      updatedEvidenceCount > 0 ||
      deletedEvidenceCount > 0 ||
      deletedSkillCount > 0,
    createdEvidenceCount,
    createdSkillCount,
    deletedEvidenceCount,
    deletedSkillCount,
    updatedEvidenceCount,
  };
}

export async function ensureCurrentCandidateSkills(
  database: Pick<PrismaClient, "$transaction">,
  userId: string,
) {
  return database.$transaction(async (transaction) => {
    const synchronization = await synchronizeVerifiedCandidateSkills(
      transaction,
      userId,
    );
    if (synchronization.changed) {
      await invalidateCandidateJobMatchAnalyses(transaction, userId);
    }
    return synchronization;
  });
}
