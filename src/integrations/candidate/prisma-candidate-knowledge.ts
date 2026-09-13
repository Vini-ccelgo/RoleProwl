import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  buildCandidateKnowledgeCoverage,
  candidateKnowledgeGapPrompts,
  candidateKnowledgePolicy,
  isCandidateKnowledgeConcept,
  resolveCandidateKnowledge,
  type CandidateKnowledgeConcept,
} from "@/core/domain/candidate/candidate-knowledge";
import type { CandidateNarrativeProposalDraft } from "@/features/candidate/candidate-narrative-extraction";
import { evidenceFromCandidateSources } from "@/features/candidate/candidate-knowledge-evidence";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/core/errors/application-errors";
import { databaseClient } from "@/lib/db/client";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";

export async function getCandidateKnowledgeSnapshot(
  userId: string,
  now = new Date(),
  database: PrismaClient = databaseClient(),
) {
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
    memories,
    narratives,
    proposals,
  ] = await Promise.all([
    database.candidateProfile.findUnique({ where: { userId } }),
    database.workExperience.findMany({ where: { userId } }),
    database.education.findMany({ where: { userId } }),
    database.skill.findMany({ where: { userId } }),
    database.project.findMany({ where: { userId } }),
    database.credential.findMany({ where: { userId } }),
    database.candidateFact.findMany({ where: { userId, status: "ACTIVE" } }),
    database.candidatePreferences.findUnique({ where: { userId } }),
    database.workAuthorizationProfile.findUnique({ where: { userId } }),
    database.answerMemory.findMany({ where: { userId } }),
    database.candidateNarrative.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    database.candidateKnowledgeProposal.findMany({
      where: { userId, status: "PENDING" },
      include: { narrative: { select: { theme: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const evidence = evidenceFromCandidateSources({
    profile,
    experiences,
    education,
    skills,
    projects,
    credentials,
    verifiedResumeFacts,
    preferences,
    authorization,
    memories,
  });
  const coverage = buildCandidateKnowledgeCoverage({ evidence, now });
  return {
    coverage,
    gapPrompts: candidateKnowledgeGapPrompts(coverage),
    narratives,
    proposals,
    counts: {
      known: coverage.filter((item) => item.status === "KNOWN").length,
      worthCompleting: coverage.filter(
        (item) =>
          (item.status === "MISSING" || item.status === "PARTIAL") &&
          !candidateKnowledgePolicy(item.concept)?.candidateInputOptional,
      ).length,
      optional: coverage.filter(
        (item) =>
          item.status === "MISSING" &&
          candidateKnowledgePolicy(item.concept)?.candidateInputOptional,
      ).length,
      conflicts: coverage.filter((item) => item.status === "CONFLICT").length,
    },
  };
}

export async function queryCandidateKnowledge(input: {
  readonly userId: string;
  readonly concept: CandidateKnowledgeConcept;
  readonly now?: Date;
  readonly snapshot?: Awaited<ReturnType<typeof getCandidateKnowledgeSnapshot>>;
}) {
  const snapshot =
    input.snapshot ??
    (await getCandidateKnowledgeSnapshot(input.userId, input.now));
  const found = snapshot.coverage.find(
    (item) => item.concept === input.concept,
  );
  return (
    found?.result ??
    resolveCandidateKnowledge({
      concept: input.concept,
      evidence: [],
      now: input.now,
    })
  );
}

/**
 * Loads candidate evidence once, then deliberately resolves each concept through
 * the public candidate-knowledge query contract. Application code uses this
 * boundary instead of rebuilding profile/fact/preference precedence itself.
 */
export async function queryCandidateKnowledgeBatch(input: {
  readonly userId: string;
  readonly concepts?: readonly CandidateKnowledgeConcept[];
  readonly now?: Date;
}) {
  const snapshot = await getCandidateKnowledgeSnapshot(input.userId, input.now);
  const concepts =
    input.concepts ?? snapshot.coverage.map((item) => item.concept);
  return Promise.all(
    [...new Set(concepts)].map((concept) =>
      queryCandidateKnowledge({ ...input, concept, snapshot }),
    ),
  );
}

export interface DirectCandidateKnowledgeInput {
  readonly userId: string;
  readonly concept: string;
  readonly answer: Readonly<Record<string, unknown>>;
  readonly confirmedAt?: Date;
  readonly resolvesConflicts?: boolean;
}

async function upsertDirectCandidateKnowledge(
  transaction: Prisma.TransactionClient,
  input: DirectCandidateKnowledgeInput,
) {
  if (!isCandidateKnowledgeConcept(input.concept))
    throw new ValidationError("Unknown recurring candidate concept.");
  if (Object.keys(input.answer).length === 0)
    throw new ValidationError("A recurring answer cannot be empty.");
  const policy = candidateKnowledgePolicy(input.concept)!;
  const confirmedAt = input.confirmedAt ?? new Date();
  const answer = input.resolvesConflicts
    ? {
        ...input.answer,
        _candidateConflictResolvedAt: confirmedAt.toISOString(),
      }
    : input.answer;
  const memory = await transaction.answerMemory.upsert({
    where: {
      userId_concept: { userId: input.userId, concept: input.concept },
    },
    create: {
      userId: input.userId,
      concept: input.concept,
      answer: answer as Prisma.InputJsonObject,
      source:
        policy.class === "VOLATILE_CONSEQUENTIAL"
          ? "EXPLICIT_CONSEQUENTIAL"
          : "USER_POLICY",
      origin: "EXPLICIT",
      candidateApproved: true,
      reusable: true,
      autoAnswerAllowed: policy.reusableForEmployerQuestions,
      reverifyAfterDays: policy.reverifyAfterDays,
      verifiedAt: confirmedAt,
    },
    update: {
      answer: answer as Prisma.InputJsonObject,
      source:
        policy.class === "VOLATILE_CONSEQUENTIAL"
          ? "EXPLICIT_CONSEQUENTIAL"
          : "USER_POLICY",
      origin: "EXPLICIT",
      candidateApproved: true,
      reusable: true,
      autoAnswerAllowed: policy.reusableForEmployerQuestions,
      reverifyAfterDays: policy.reverifyAfterDays,
      verifiedAt: confirmedAt,
      sourceNarrativeId: null,
    },
    select: { id: true },
  });
  await transaction.auditEvent.create({
    data: {
      actorUserId: input.userId,
      action: "QUESTION_ANSWERED",
      entityType: "answerMemory",
      entityId: memory.id,
      metadata: { concept: input.concept, source: "CANDIDATE_DIRECT" },
    },
  });
  return memory;
}

export async function saveDirectCandidateKnowledgeBatch(
  inputs: readonly DirectCandidateKnowledgeInput[],
  database: PrismaClient = databaseClient(),
) {
  if (!inputs.length) return [];
  const userId = inputs[0]!.userId;
  if (inputs.some((input) => input.userId !== userId))
    throw new ValidationError("Recurring answers must have the same owner.");
  const concepts = new Set<string>();
  for (const input of inputs) {
    if (concepts.has(input.concept))
      throw new ValidationError("A recurring concept may be saved only once.");
    concepts.add(input.concept);
  }
  return database.$transaction(async (transaction) => {
    const memories = [];
    for (const input of inputs)
      memories.push(await upsertDirectCandidateKnowledge(transaction, input));
    await invalidateReadyApplicationPackets(transaction, userId);
    return memories;
  });
}

export async function saveDirectCandidateKnowledge(
  input: DirectCandidateKnowledgeInput,
  database: PrismaClient = databaseClient(),
) {
  return database.$transaction(async (transaction) => {
    const memory = await upsertDirectCandidateKnowledge(transaction, input);
    await invalidateReadyApplicationPackets(transaction, input.userId);
    return memory;
  });
}

export function createCandidateNarrative(input: {
  readonly userId: string;
  readonly theme:
    "PROFESSIONAL_CONTEXT" | "RECURRING_DETAILS" | "RECURRING_PREFERENCES";
  readonly content: string;
}) {
  const content = input.content.trim();
  if (!content || content.length > 12_000)
    throw new ValidationError(
      "Candidate narrative must contain 1 to 12,000 characters.",
    );
  return databaseClient().candidateNarrative.create({
    data: { ...input, content },
    select: { id: true },
  });
}

export async function persistCandidateKnowledgeProposals(input: {
  readonly userId: string;
  readonly narrativeId: string;
  readonly proposals: readonly CandidateNarrativeProposalDraft[];
}) {
  if (!input.proposals.length) return { count: 0 };
  const owned = await databaseClient().candidateNarrative.findFirst({
    where: { id: input.narrativeId, userId: input.userId },
    select: { id: true },
  });
  if (!owned) throw new NotFoundError();
  return databaseClient().candidateKnowledgeProposal.createMany({
    data: input.proposals.map((proposal) => ({
      userId: input.userId,
      narrativeId: input.narrativeId,
      concept: proposal.concept,
      proposedValue: proposal.proposedValue as Prisma.InputJsonObject,
      supportingText: proposal.supportingText,
      origin: proposal.origin,
      confidence: proposal.confidence,
      reusable: proposal.reusable,
    })),
  });
}

export async function reviewCandidateKnowledgeProposal(
  database: PrismaClient,
  input: {
    readonly userId: string;
    readonly proposalId: string;
    readonly decision: "APPROVE" | "CORRECT" | "DECLINE";
    readonly correctedValue?: Readonly<Record<string, unknown>>;
  },
) {
  return database.$transaction(async (transaction) => {
    const proposal = await transaction.candidateKnowledgeProposal.findFirst({
      where: { id: input.proposalId, userId: input.userId, status: "PENDING" },
    });
    if (!proposal) throw new NotFoundError();
    if (input.decision === "DECLINE") {
      const updated = await transaction.candidateKnowledgeProposal.updateMany({
        where: { id: proposal.id, userId: input.userId, status: "PENDING" },
        data: { status: "DECLINED", reusable: false, reviewedAt: new Date() },
      });
      if (updated.count !== 1)
        throw new ConflictError("This proposal has already been reviewed.");
      return { status: "DECLINED" as const, memoryId: null };
    }
    const answer =
      input.decision === "CORRECT"
        ? input.correctedValue
        : (proposal.proposedValue as Prisma.JsonObject);
    if (!answer || Object.keys(answer).length === 0)
      throw new ValidationError(
        "A corrected recurring answer cannot be empty.",
      );
    if (!isCandidateKnowledgeConcept(proposal.concept))
      throw new ValidationError("Unknown recurring candidate concept.");
    const updated = await transaction.candidateKnowledgeProposal.updateMany({
      where: { id: proposal.id, userId: input.userId, status: "PENDING" },
      data: {
        status: input.decision === "CORRECT" ? "CORRECTED" : "APPROVED",
        acceptedValue: answer as Prisma.InputJsonObject,
        reviewedAt: new Date(),
      },
    });
    if (updated.count !== 1)
      throw new ConflictError("This proposal has already been reviewed.");
    const policy = candidateKnowledgePolicy(proposal.concept)!;
    const memory = await transaction.answerMemory.upsert({
      where: {
        userId_concept: { userId: input.userId, concept: proposal.concept },
      },
      create: {
        userId: input.userId,
        concept: proposal.concept,
        answer: answer as Prisma.InputJsonObject,
        source:
          policy.class === "VOLATILE_CONSEQUENTIAL"
            ? "EXPLICIT_CONSEQUENTIAL"
            : "USER_POLICY",
        origin: proposal.origin,
        candidateApproved: true,
        reusable: true,
        sourceNarrativeId: proposal.narrativeId,
        autoAnswerAllowed: policy.reusableForEmployerQuestions,
        reverifyAfterDays: policy.reverifyAfterDays,
        verifiedAt: new Date(),
      },
      update: {
        answer: answer as Prisma.InputJsonObject,
        source:
          policy.class === "VOLATILE_CONSEQUENTIAL"
            ? "EXPLICIT_CONSEQUENTIAL"
            : "USER_POLICY",
        origin: proposal.origin,
        candidateApproved: true,
        reusable: true,
        sourceNarrativeId: proposal.narrativeId,
        autoAnswerAllowed: policy.reusableForEmployerQuestions,
        reverifyAfterDays: policy.reverifyAfterDays,
        verifiedAt: new Date(),
      },
      select: { id: true },
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId: input.userId,
        action: "QUESTION_ANSWERED",
        entityType: "answerMemory",
        entityId: memory.id,
        metadata: { concept: proposal.concept, decision: input.decision },
      },
    });
    await invalidateReadyApplicationPackets(transaction, input.userId);
    return {
      status:
        input.decision === "CORRECT"
          ? ("CORRECTED" as const)
          : ("APPROVED" as const),
      memoryId: memory.id,
    };
  });
}
