import type { Prisma } from "@/generated/prisma/client";
import { isSupportedProposalDestination } from "@/core/domain/candidate/proposal-destinations";

export interface ProposalSummary {
  readonly confidence: number | null;
  readonly documentId: string;
  readonly factType: string;
  readonly id: string;
  readonly sourceFileName: string;
  readonly sourceText: string;
  readonly supported: boolean;
  readonly value: string;
}

export const proposalReviewSelect = {
  id: true,
  factType: true,
  proposedValue: true,
  sourceRegion: true,
  targetPath: true,
  confidence: true,
  document: {
    select: {
      id: true,
      originalFileName: true,
    },
  },
} as const satisfies Prisma.CandidateFactProposalSelect;

export function pendingProposalReviewQuery(userId: string) {
  return {
    where: { userId, status: "PENDING" as const },
    orderBy: { createdAt: "asc" as const },
    select: proposalReviewSelect,
  } satisfies Prisma.CandidateFactProposalFindManyArgs;
}

type ProposalReviewRecord = {
  readonly confidence: number | null;
  readonly document: {
    readonly id: string;
    readonly originalFileName: string;
  };
  readonly factType: string;
  readonly id: string;
  readonly proposedValue: unknown;
  readonly sourceRegion: unknown;
  readonly targetPath: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function proposalReviewSummary(
  proposal: ProposalReviewRecord,
): ProposalSummary {
  const value = object(proposal.proposedValue);
  const source = object(proposal.sourceRegion);
  return {
    id: proposal.id,
    documentId: proposal.document.id,
    sourceFileName: proposal.document.originalFileName,
    factType: proposal.factType,
    supported: isSupportedProposalDestination(
      proposal.factType,
      proposal.targetPath,
    ),
    confidence: proposal.confidence,
    value: typeof value.text === "string" ? value.text : JSON.stringify(value),
    sourceText:
      typeof source.text === "string"
        ? source.text
        : "Extracted document region",
  };
}
