import {
  decideFactProposal,
  type JsonObject,
  type ProposalDecision,
} from "@/core/domain/candidate/fact-verification";
import { ConflictError } from "@/core/errors/application-errors";
import type { Prisma } from "@/generated/prisma/client";

export interface PersistFactProposalDecisionInput {
  readonly decision: ProposalDecision;
  readonly editedValue?: JsonObject;
  readonly proposalId: string;
  readonly userId: string;
}

export async function persistFactProposalDecision(
  transaction: Prisma.TransactionClient,
  input: PersistFactProposalDecisionInput,
) {
  const proposal = await transaction.candidateFactProposal.findFirst({
    where: { id: input.proposalId, userId: input.userId },
    select: {
      id: true,
      userId: true,
      factType: true,
      proposedValue: true,
      status: true,
      targetPath: true,
    },
  });
  const decision = decideFactProposal(
    proposal
      ? { ...proposal, proposedValue: proposal.proposedValue as JsonObject }
      : null,
    input.userId,
    input.decision,
    input.editedValue,
  );

  if (!decision.createCanonicalFact) {
    const updated = await transaction.candidateFactProposal.updateMany({
      where: { id: input.proposalId, userId: input.userId, status: "PENDING" },
      data: { status: "REJECTED", reviewedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new ConflictError("This proposal has already been reviewed.");
    }
    return { status: "REJECTED" as const, canonicalFactId: null };
  }

  const fact = await transaction.candidateFact.create({
    data: {
      userId: input.userId,
      factType: proposal!.factType,
      value: decision.acceptedValue! as Prisma.InputJsonValue,
      sourceProposalId: input.proposalId,
    },
    select: { id: true },
  });
  const updated = await transaction.candidateFactProposal.updateMany({
    where: { id: input.proposalId, userId: input.userId, status: "PENDING" },
    data: {
      status: decision.status,
      acceptedValue: decision.acceptedValue! as Prisma.InputJsonValue,
      canonicalType: "CANDIDATE_FACT",
      canonicalId: fact.id,
      reviewedAt: new Date(),
    },
  });
  if (updated.count !== 1) {
    throw new ConflictError("This proposal has already been reviewed.");
  }
  await transaction.auditEvent.create({
    data: {
      actorUserId: input.userId,
      action:
        input.decision === "EDIT_AND_ACCEPT"
          ? "CANDIDATE_FACT_CHANGED"
          : "CANDIDATE_FACT_VERIFIED",
      entityType: "candidateFact",
      entityId: fact.id,
      metadata:
        input.decision === "EDIT_AND_ACCEPT"
          ? {
              factType: proposal!.factType,
              changedFields: Object.keys(input.editedValue ?? {}),
            }
          : { factType: proposal!.factType, source: "RESUME_EXTRACTED" },
    },
  });
  return { status: decision.status, canonicalFactId: fact.id };
}
