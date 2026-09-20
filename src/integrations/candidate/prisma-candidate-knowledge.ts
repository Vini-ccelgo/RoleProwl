import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  buildCandidateKnowledgeCoverage,
  candidateKnowledgeAnswerTextValues,
  candidateKnowledgeGapPrompts,
  candidateKnowledgeProfileGroups,
  candidateKnowledgePolicy,
  isOpaqueEmployerOptionAnswer,
  isCandidateKnowledgeConcept,
  isReusableChoiceConcept,
  isValidCandidateKnowledgeAnswer,
  PROFESSIONAL_HISTORY_AUTHORITY_CONCEPTS,
  resolveCandidateKnowledge,
  type CandidateKnowledgeConcept,
} from "@/core/domain/candidate/candidate-knowledge";
import { isApplicationPacket } from "@/core/domain/applications/application-packet";
import type { CandidateNarrativeProposalDraft } from "@/features/candidate/candidate-narrative-extraction";
import { evidenceFromCandidateSources } from "@/features/candidate/candidate-knowledge-evidence";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/core/errors/application-errors";
import { databaseClient } from "@/lib/db/client";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";

interface StoredCandidateMemory {
  readonly id: string;
  readonly userId: string;
  readonly concept: string;
  readonly answer: unknown;
  readonly autoAnswerAllowed: boolean;
  readonly origin: "EXPLICIT" | "DERIVED";
  readonly candidateApproved: boolean;
  readonly reusable: boolean;
  readonly verifiedAt: Date;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function semanticLabelsFromPackets(input: {
  readonly concept: CandidateKnowledgeConcept;
  readonly rawValues: readonly string[];
  readonly snapshots: readonly Prisma.JsonValue[];
}) {
  return input.rawValues.map((rawValue) => {
    const labels = new Set<string>();
    for (const snapshot of input.snapshots) {
      const payload = record(snapshot);
      const packet = isApplicationPacket(payload?.packet)
        ? payload.packet
        : null;
      for (const answer of packet?.answers ?? []) {
        if (answer.canonicalConcept !== input.concept) continue;
        for (const option of answer.optionIdentities ?? [])
          if (option.value === rawValue && option.label.trim())
            labels.add(option.label.trim());
      }
    }
    return labels.size === 1 ? [...labels][0]! : null;
  });
}

async function repairReusableChoiceMemories(
  userId: string,
  memories: readonly StoredCandidateMemory[],
  database: PrismaClient,
) {
  const choiceMemories = memories.filter(
    (memory) =>
      isCandidateKnowledgeConcept(memory.concept) &&
      isReusableChoiceConcept(memory.concept),
  );
  if (!choiceMemories.length)
    return { memories, removedConcepts: [] as CandidateKnowledgeConcept[] };
  const applications = await database.application.findMany({
    where: { userId },
    select: { submissionPayloadSnapshot: true },
  });
  const snapshots = applications.map(
    (application) => application.submissionPayloadSnapshot,
  );
  const repaired = new Map<string, Readonly<Record<string, unknown>>>();
  const removed = new Set<string>();
  for (const memory of choiceMemories) {
    const concept = memory.concept as CandidateKnowledgeConcept;
    const answer = record(memory.answer);
    if (!answer) continue;
    const rawValues = candidateKnowledgeAnswerTextValues(answer);
    if (!rawValues.length) continue;
    const labels = semanticLabelsFromPackets({ concept, rawValues, snapshots });
    const hasRecoverableRawIdentity = labels.every(Boolean);
    const changesMeaningfulRepresentation = labels.some(
      (label, index) => label !== rawValues[index],
    );
    if (hasRecoverableRawIdentity && changesMeaningfulRepresentation) {
      repaired.set(memory.id, { text: labels.join(", ") });
      continue;
    }
    if (isOpaqueEmployerOptionAnswer(concept, answer)) removed.add(memory.id);
  }
  if (!repaired.size && !removed.size)
    return { memories, removedConcepts: [] as CandidateKnowledgeConcept[] };
  await database.$transaction(async (transaction) => {
    for (const memory of choiceMemories) {
      const repairedAnswer = repaired.get(memory.id);
      const remove = removed.has(memory.id);
      if (!repairedAnswer && !remove) continue;
      if (repairedAnswer)
        await transaction.answerMemory.updateMany({
          where: { id: memory.id, userId, concept: memory.concept },
          data: { answer: repairedAnswer as Prisma.InputJsonObject },
        });
      else
        await transaction.answerMemory.deleteMany({
          where: { id: memory.id, userId, concept: memory.concept },
        });
      await transaction.auditEvent.create({
        data: {
          actorUserId: userId,
          action: "POLICY_CHANGED",
          entityType: "answerMemory",
          entityId: memory.id,
          metadata: {
            concept: memory.concept,
            operation: repairedAnswer ? "SEMANTIC_REPAIR" : "REMOVED",
            reason: "EMPLOYER_OPTION_ID_NOT_REUSABLE",
          },
        },
      });
    }
    await invalidateReadyApplicationPackets(transaction, userId);
  });
  const removedConcepts = choiceMemories.flatMap((memory) =>
    removed.has(memory.id) && isCandidateKnowledgeConcept(memory.concept)
      ? [memory.concept]
      : [],
  );
  return {
    memories: memories.flatMap((memory) => {
      if (removed.has(memory.id)) return [];
      const answer = repaired.get(memory.id);
      return answer ? [{ ...memory, answer }] : [memory];
    }),
    removedConcepts,
  };
}

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
  const normalizedMemories = await repairReusableChoiceMemories(
    userId,
    memories,
    database,
  );
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
    memories: normalizedMemories.memories,
  });
  const coverage = buildCandidateKnowledgeCoverage({ evidence, now });
  const reusableDetailCoverage = coverage.filter(
    (item) =>
      item.concept !== "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION" &&
      item.concept !== "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
  );
  const profileGroups = candidateKnowledgeProfileGroups(coverage);
  const currentDetails = coverage.filter(
    (item) =>
      item.result.value !== null &&
      ![
        "FIRST_NAME",
        "LAST_NAME",
        "APPLICATION_EMAIL",
        "PHONE",
        "WEBSITE_URL",
        "LINKEDIN_URL",
        "EMPLOYMENT_HISTORY",
        "EDUCATION_HISTORY",
        "CERTIFICATIONS",
        "SKILLS",
        "PROJECTS",
        "US_WORK_AUTHORIZATION",
        "US_FUTURE_SPONSORSHIP",
        "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
        "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
      ].includes(item.concept) &&
      !item.concept.startsWith("LANGUAGE:") &&
      !item.concept.startsWith("WORK_AUTHORIZATION:") &&
      !item.concept.startsWith("SPONSORSHIP_REQUIREMENT:"),
  );
  const jurisdictionCountryCodes = new Set(
    coverage.flatMap((item) => {
      if (
        !item.result.value ||
        (!item.concept.startsWith("WORK_AUTHORIZATION:") &&
          !item.concept.startsWith("SPONSORSHIP_REQUIREMENT:"))
      )
        return [];
      return [item.concept.slice(item.concept.indexOf(":") + 1)];
    }),
  );
  const jurisdictions = [...jurisdictionCountryCodes]
    .sort()
    .map((countryCode) => ({
      countryCode,
      authorization: coverage.find(
        (item) => item.concept === `WORK_AUTHORIZATION:${countryCode}`,
      ),
      sponsorship: coverage.find(
        (item) => item.concept === `SPONSORSHIP_REQUIREMENT:${countryCode}`,
      ),
    }));
  return {
    coverage,
    currentDetails,
    jurisdictions,
    gapPrompts: candidateKnowledgeGapPrompts(coverage),
    narratives,
    proposals,
    invalidatedReusableConcepts: normalizedMemories.removedConcepts,
    counts: {
      known: profileGroups.KNOWN.length,
      worthCompleting: profileGroups.RECOMMENDED.length,
      optional: profileGroups.OPTIONAL.length,
      conflicts: reusableDetailCoverage.filter(
        (item) => item.status === "CONFLICT",
      ).length,
      attention: profileGroups.ATTENTION.length,
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
  if (!isValidCandidateKnowledgeAnswer(input.concept, input.answer))
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

async function removeProfessionalHistoryAuthorityMemories(
  transaction: Prisma.TransactionClient,
  input: {
    readonly userId: string;
    readonly concepts: readonly (typeof PROFESSIONAL_HISTORY_AUTHORITY_CONCEPTS)[number][];
    readonly reason: "HISTORY_CHANGED" | "USER_REVOCATION";
  },
) {
  const memories = await transaction.answerMemory.findMany({
    where: { userId: input.userId, concept: { in: [...input.concepts] } },
    select: { concept: true, id: true },
  });
  if (!memories.length) return 0;
  const removed = await transaction.answerMemory.deleteMany({
    where: {
      id: { in: memories.map((memory) => memory.id) },
      userId: input.userId,
      concept: { in: [...input.concepts] },
    },
  });
  for (const memory of memories) {
    await transaction.auditEvent.create({
      data: {
        actorUserId: input.userId,
        action: "POLICY_CHANGED",
        entityType: "answerMemory",
        entityId: memory.id,
        metadata: {
          concept: memory.concept,
          operation: "REMOVED",
          reason: input.reason,
        },
      },
    });
  }
  return removed.count;
}

export function invalidateProfessionalHistoryAuthorities(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  return removeProfessionalHistoryAuthorityMemories(transaction, {
    userId,
    concepts: PROFESSIONAL_HISTORY_AUTHORITY_CONCEPTS,
    reason: "HISTORY_CHANGED",
  });
}

export async function setProfessionalHistoryAuthorities(
  input: {
    readonly userId: string;
    readonly complete: boolean;
    readonly negativeInference: boolean;
    readonly confirmedAt?: Date;
  },
  database: PrismaClient = databaseClient(),
) {
  const confirmedAt = input.confirmedAt ?? new Date();
  return database.$transaction(async (transaction) => {
    if (!input.complete) {
      await removeProfessionalHistoryAuthorityMemories(transaction, {
        userId: input.userId,
        concepts: PROFESSIONAL_HISTORY_AUTHORITY_CONCEPTS,
        reason: "USER_REVOCATION",
      });
    } else {
      await upsertDirectCandidateKnowledge(transaction, {
        userId: input.userId,
        concept: "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
        answer: { attested: true },
        confirmedAt,
      });
      if (input.negativeInference) {
        await upsertDirectCandidateKnowledge(transaction, {
          userId: input.userId,
          concept: "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
          answer: { authorized: true },
          confirmedAt,
        });
      } else {
        await removeProfessionalHistoryAuthorityMemories(transaction, {
          userId: input.userId,
          concepts: ["NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION"],
          reason: "USER_REVOCATION",
        });
      }
    }
    await invalidateReadyApplicationPackets(transaction, input.userId);
    return {
      complete: input.complete,
      negativeInference: input.complete && input.negativeInference,
    };
  });
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

export async function reconfirmDirectCandidateKnowledge(
  input: {
    readonly userId: string;
    readonly concept: string;
    readonly confirmedAt?: Date;
  },
  database: PrismaClient = databaseClient(),
) {
  if (!isCandidateKnowledgeConcept(input.concept))
    throw new ValidationError("Unknown recurring candidate concept.");
  const confirmedAt = input.confirmedAt ?? new Date();
  const current = await queryCandidateKnowledge({
    userId: input.userId,
    concept: input.concept,
    now: confirmedAt,
    snapshot: await getCandidateKnowledgeSnapshot(
      input.userId,
      confirmedAt,
      database,
    ),
  });
  if (!current.value) throw new NotFoundError();
  return saveDirectCandidateKnowledge(
    {
      userId: input.userId,
      concept: input.concept,
      answer: current.value,
      confirmedAt,
      resolvesConflicts: current.conflict,
    },
    database,
  );
}

export async function removeDirectCandidateKnowledge(
  input: { readonly userId: string; readonly concept: string },
  database: PrismaClient = databaseClient(),
) {
  if (!isCandidateKnowledgeConcept(input.concept))
    throw new ValidationError("Unknown recurring candidate concept.");
  return database.$transaction(async (transaction) => {
    const current = await transaction.answerMemory.findFirst({
      where: { userId: input.userId, concept: input.concept },
      select: { id: true },
    });
    if (!current) throw new NotFoundError();
    const removed = await transaction.answerMemory.deleteMany({
      where: {
        id: current.id,
        userId: input.userId,
        concept: input.concept,
      },
    });
    if (removed.count !== 1) throw new NotFoundError();
    await transaction.auditEvent.create({
      data: {
        actorUserId: input.userId,
        action: "QUESTION_ANSWERED",
        entityType: "answerMemory",
        entityId: current.id,
        metadata: {
          concept: input.concept,
          operation: "REMOVED",
          reason: "USER_REVOCATION",
        },
      },
    });
    await invalidateReadyApplicationPackets(transaction, input.userId);
    return { removed: true as const };
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
    if (!isValidCandidateKnowledgeAnswer(proposal.concept, answer))
      throw new ValidationError("Invalid recurring candidate answer.");
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
