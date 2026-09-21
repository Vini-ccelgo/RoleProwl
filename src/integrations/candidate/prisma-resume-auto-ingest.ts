import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  AUTO_INGEST_PROFILE_FACT_TYPES,
  equivalentResumeFactText,
  isSourceExplicitAutoIngestProposal,
  resumeFactText,
} from "@/core/domain/candidate/resume-auto-ingest";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";
import { invalidateCandidateJobMatchAnalyses } from "@/integrations/jobs/invalidate-job-match-analyses";
import { invalidateProfessionalHistoryAuthorities } from "./prisma-candidate-knowledge";
import { synchronizeVerifiedCandidateSkills } from "./sync-verified-candidate-skills";

export async function autoIngestSourceExplicitResumeFacts(
  database: PrismaClient,
  input: { readonly userId: string; readonly documentId?: string },
) {
  return database.$transaction(async (transaction) => {
    const [proposals, profile, existingFacts] = await Promise.all([
      transaction.candidateFactProposal.findMany({
        where: {
          userId: input.userId,
          status: "PENDING",
          ...(input.documentId ? { documentId: input.documentId } : {}),
        },
        select: {
          id: true,
          confidence: true,
          factType: true,
          proposedValue: true,
          sourceRegion: true,
          targetPath: true,
        },
      }),
      transaction.candidateProfile.findUnique({
        where: { userId: input.userId },
        select: {
          firstName: true,
          lastName: true,
          applicationEmail: true,
          professionalTitle: true,
          phone: true,
          location: true,
          countryCode: true,
          websiteUrl: true,
          linkedInUrl: true,
        },
      }),
      transaction.candidateFact.findMany({
        where: { userId: input.userId, status: "ACTIVE" },
        select: { id: true, factType: true, value: true },
      }),
    ]);
    const eligible = proposals.filter((proposal) => {
      if (
        (AUTO_INGEST_PROFILE_FACT_TYPES as readonly string[]).includes(
          proposal.factType,
        ) &&
        existingFacts.some(
          (fact) =>
            fact.factType === proposal.factType &&
            !equivalentResumeFactText(
              resumeFactText(fact.value),
              resumeFactText(proposal.proposedValue),
            ),
        )
      )
        return false;
      return isSourceExplicitAutoIngestProposal({
        proposal,
        peerProposals: proposals,
        profile,
      });
    });
    let importedCount = 0;
    let professionalHistoryChanged = false;
    let skillsChanged = false;
    for (const proposal of eligible) {
      const proposedText = resumeFactText(proposal.proposedValue);
      const equivalent = existingFacts.find(
        (fact) =>
          fact.factType === proposal.factType &&
          equivalentResumeFactText(resumeFactText(fact.value), proposedText),
      );
      const claimed = await transaction.candidateFactProposal.updateMany({
        where: { id: proposal.id, userId: input.userId, status: "PENDING" },
        data: {
          status: "ACCEPTED",
          acceptedValue: proposal.proposedValue as Prisma.InputJsonValue,
          canonicalType: "CANDIDATE_FACT",
          ...(equivalent ? { canonicalId: equivalent.id } : {}),
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) continue;
      if (!equivalent) {
        const fact = await transaction.candidateFact.create({
          data: {
            userId: input.userId,
            factType: proposal.factType,
            value: proposal.proposedValue as Prisma.InputJsonValue,
            sourceProposalId: proposal.id,
          },
          select: { id: true },
        });
        await transaction.candidateFactProposal.update({
          where: { id: proposal.id },
          data: { canonicalId: fact.id },
        });
        await transaction.auditEvent.create({
          data: {
            actorUserId: input.userId,
            action: "CANDIDATE_FACT_VERIFIED",
            entityType: "candidateFact",
            entityId: fact.id,
            metadata: {
              factType: proposal.factType,
              source: "RESUME_SOURCE_EXPLICIT",
              operation: "AUTO_INGESTED",
            },
          },
        });
        existingFacts.push({
          id: fact.id,
          factType: proposal.factType,
          value: proposal.proposedValue,
        });
      }
      importedCount += 1;
      professionalHistoryChanged ||=
        proposal.factType === "WORK_EXPERIENCE_TEXT";
      skillsChanged ||= proposal.factType === "SKILL_TEXT";
    }
    if (professionalHistoryChanged)
      await invalidateProfessionalHistoryAuthorities(transaction, input.userId);
    if (skillsChanged)
      await synchronizeVerifiedCandidateSkills(transaction, input.userId);
    if (importedCount) {
      await invalidateReadyApplicationPackets(transaction, input.userId);
      await invalidateCandidateJobMatchAnalyses(transaction, input.userId);
    }
    return { importedCount, reviewCount: proposals.length - importedCount };
  });
}
