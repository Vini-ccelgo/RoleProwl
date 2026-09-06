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
        id: true,
        normalizedName: true,
        source: true,
      },
    }),
    transaction.candidateSkillEvidence.findMany({
      where: {
        OR: [
          { evidenceType: CANDIDATE_FACT_SKILL_EVIDENCE_TYPE },
          { verificationState: "VERIFIED" },
        ],
        userId,
      },
      select: {
        description: true,
        evidenceId: true,
        evidenceType: true,
        id: true,
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
  const skillNamesById = new Map(
    currentSkills.map((skill) => [skill.id, skill.normalizedName]),
  );
  const currentCandidateEvidence = currentEvidence.filter(
    ({ evidenceType }) => evidenceType === CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
  );
  const evidenceByKey = new Map<string, (typeof currentEvidence)[number]>();
  for (const evidence of currentCandidateEvidence) {
    const normalizedName = skillNamesById.get(evidence.skillId);
    if (normalizedName) {
      evidenceByKey.set(
        `${normalizedName}\u0000${evidence.evidenceId}`,
        evidence,
      );
    }
  }
  const missingSkills = new Map(
    [...desired.values()]
      .filter(({ normalizedName }) => !skillsByName.has(normalizedName))
      .map((atom) => [atom.normalizedName, atom]),
  );
  const createdSkills = missingSkills.size
    ? await transaction.skill.createManyAndReturn({
        data: [...missingSkills.values()].map((atom) => ({
          canonicalName: atom.canonicalName,
          normalizedName: atom.normalizedName,
          source: "RESUME_EXTRACTED" as const,
          userId,
          verificationState: "VERIFIED" as const,
        })),
        skipDuplicates: true,
        select: {
          canonicalName: true,
          id: true,
          normalizedName: true,
          source: true,
        },
      })
    : [];
  for (const skill of createdSkills) {
    skillsByName.set(skill.normalizedName, skill);
    skillNamesById.set(skill.id, skill.normalizedName);
  }

  const unresolvedSkillNames = [...missingSkills.keys()].filter(
    (normalizedName) => !skillsByName.has(normalizedName),
  );
  if (unresolvedSkillNames.length) {
    // A concurrent synchronization may win the unique (userId,
    // normalizedName) insert. Resolve those IDs once instead of falling back
    // to per-skill upserts.
    const concurrentlyCreatedSkills = await transaction.skill.findMany({
      where: { normalizedName: { in: unresolvedSkillNames }, userId },
      select: {
        canonicalName: true,
        id: true,
        normalizedName: true,
        source: true,
      },
    });
    for (const skill of concurrentlyCreatedSkills) {
      skillsByName.set(skill.normalizedName, skill);
      skillNamesById.set(skill.id, skill.normalizedName);
    }
  }

  const missingEvidenceKeys = new Set<string>();
  const mismatchedEvidenceIds = new Set<string>();
  for (const [key, atom] of desired) {
    const evidence = evidenceByKey.get(key);
    if (!evidence) {
      missingEvidenceKeys.add(key);
    } else if (
      evidence.description !== atom.description ||
      evidence.source !== "RESUME_EXTRACTED" ||
      evidence.verificationState !== "VERIFIED"
    ) {
      mismatchedEvidenceIds.add(evidence.id);
    }
  }

  if (mismatchedEvidenceIds.size) {
    // The unique relationship tuple is the durable identity. Replacing stale
    // metadata in one set operation avoids one update round trip per atom.
    await transaction.candidateSkillEvidence.deleteMany({
      where: { id: { in: [...mismatchedEvidenceIds] }, userId },
    });
  }

  const evidenceToCreate = [...desired].filter(
    ([key]) =>
      missingEvidenceKeys.has(key) ||
      mismatchedEvidenceIds.has(evidenceByKey.get(key)?.id ?? ""),
  );
  if (evidenceToCreate.length) {
    await transaction.candidateSkillEvidence.createMany({
      data: evidenceToCreate.map(([, atom]) => {
        const skill = skillsByName.get(atom.normalizedName);
        if (!skill) {
          throw new Error(
            "Candidate skill reconciliation could not resolve a desired skill.",
          );
        }
        return {
          description: atom.description,
          evidenceId: atom.evidenceId,
          evidenceType: CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
          skillId: skill.id,
          source: "RESUME_EXTRACTED" as const,
          userId,
          verificationState: "VERIFIED" as const,
        };
      }),
      skipDuplicates: true,
    });
  }

  const staleEvidenceIds = currentCandidateEvidence
    .filter((evidence) => {
      const normalizedName = skillNamesById.get(evidence.skillId);
      return (
        !normalizedName ||
        !desired.has(`${normalizedName}\u0000${evidence.evidenceId}`)
      );
    })
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
  const independentlySupportedSkillIds = new Set(
    currentEvidence
      .filter(
        ({ evidenceType, verificationState }) =>
          evidenceType !== CANDIDATE_FACT_SKILL_EVIDENCE_TYPE &&
          verificationState === "VERIFIED",
      )
      .map(({ skillId }) => skillId),
  );
  const unsupportedDerivedSkillIds = currentSkills
    .filter(
      (skill) =>
        skill.source === "RESUME_EXTRACTED" &&
        !desiredSkillNames.has(skill.normalizedName) &&
        !independentlySupportedSkillIds.has(skill.id),
    )
    .map(({ id }) => id);
  const deletedSkillCount = unsupportedDerivedSkillIds.length
    ? (
        await transaction.skill.deleteMany({
          where: {
            evidence: {
              none: {
                evidenceType: {
                  not: CANDIDATE_FACT_SKILL_EVIDENCE_TYPE,
                },
                verificationState: "VERIFIED",
              },
            },
            id: { in: unsupportedDerivedSkillIds },
            source: "RESUME_EXTRACTED",
            userId,
          },
        })
      ).count
    : 0;

  return {
    changed:
      createdSkills.length > 0 ||
      missingEvidenceKeys.size > 0 ||
      mismatchedEvidenceIds.size > 0 ||
      deletedEvidenceCount > 0 ||
      deletedSkillCount > 0,
    createdEvidenceCount: missingEvidenceKeys.size,
    createdSkillCount: createdSkills.length,
    deletedEvidenceCount,
    deletedSkillCount,
    updatedEvidenceCount: mismatchedEvidenceIds.size,
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
