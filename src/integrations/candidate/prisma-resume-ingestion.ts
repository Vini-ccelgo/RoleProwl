import "server-only";
import type { CandidateFactProposalDraft } from "@/core/domain/candidate/resume-import";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type ResumePersistenceSubstage =
  | "document_record_create"
  | "document_status_update"
  | "extraction_status_update"
  | "fact_proposal_persistence"
  | "transaction_commit";

export const RESUME_PERSISTENCE_TRANSACTION_TIMEOUT_MS = 15_000;

export interface ExtractedResumePersistenceInput {
  readonly documentId: string;
  readonly extractionId: string;
  readonly extractedText: string;
  readonly pageCount: number | null;
  readonly proposals: readonly CandidateFactProposalDraft[];
  readonly userId: string;
}

export class PrismaResumeIngestionRepository {
  constructor(private readonly database: PrismaClient) {}

  async persistExtractedResume(
    input: ExtractedResumePersistenceInput,
    onSubstage?: (substage: ResumePersistenceSubstage) => void,
  ) {
    await this.database.$transaction(
      async (transaction) => {
        onSubstage?.("document_status_update");
        await transaction.candidateDocument.update({
          where: { id: input.documentId },
          data: { status: "EXTRACTED" },
        });

        onSubstage?.("extraction_status_update");
        await transaction.documentExtraction.update({
          where: { documentId: input.documentId },
          data: {
            status: "SUCCEEDED",
            extractedText: input.extractedText,
            characterCount: input.extractedText.length,
            pageCount: input.pageCount,
          },
        });

        onSubstage?.("fact_proposal_persistence");
        if (input.proposals.length > 0) {
          await transaction.candidateFactProposal.createMany({
            data: input.proposals.map((proposal) => ({
              userId: input.userId,
              documentId: input.documentId,
              extractionId: input.extractionId,
              factType: proposal.factType,
              targetPath: proposal.targetPath,
              proposedValue: proposal.proposedValue as Prisma.InputJsonValue,
              sourceRegion: proposal.sourceRegion as Prisma.InputJsonValue,
              confidence: proposal.confidence,
            })),
          });
        }

        onSubstage?.("transaction_commit");
      },
      { timeout: RESUME_PERSISTENCE_TRANSACTION_TIMEOUT_MS },
    );
  }
}

export async function removeFailedResumeRecord(
  database: PrismaClient,
  input: { readonly storageKey: string; readonly userId: string },
) {
  const deleted = await database.candidateDocument.deleteMany({
    where: {
      userId: input.userId,
      storageKey: input.storageKey,
      status: "PROCESSING",
    },
  });
  if (deleted.count === 1) return true;

  const retained = await database.candidateDocument.findUnique({
    where: { storageKey: input.storageKey },
    select: { status: true },
  });
  return retained === null;
}
