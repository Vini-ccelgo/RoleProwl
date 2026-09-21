import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  invalidatePackets: vi.fn(),
  invalidateMatches: vi.fn(),
  invalidateAuthorities: vi.fn(),
  synchronizeSkills: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/applications/invalidate-application-packets", () => ({
  invalidateReadyApplicationPackets: mocks.invalidatePackets,
}));
vi.mock("@/integrations/jobs/invalidate-job-match-analyses", () => ({
  invalidateCandidateJobMatchAnalyses: mocks.invalidateMatches,
}));
vi.mock("./prisma-candidate-knowledge", () => ({
  invalidateProfessionalHistoryAuthorities: mocks.invalidateAuthorities,
}));
vi.mock("./sync-verified-candidate-skills", () => ({
  synchronizeVerifiedCandidateSkills: mocks.synchronizeSkills,
}));

import { autoIngestSourceExplicitResumeFacts } from "./prisma-resume-auto-ingest";

describe("Prisma source-explicit résumé auto-ingestion", () => {
  it("creates a provenance-linked fact and resolves the proposal without candidate review", async () => {
    const proposal = {
      id: "proposal-1",
      confidence: 0.98,
      factType: "PROFILE_EMAIL",
      proposedValue: { text: "maya@example.test" },
      sourceRegion: { text: "Email: maya@example.test" },
      targetPath: "candidateFacts.profileEmails",
    };
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const create = vi.fn(async () => ({ id: "fact-1" }));
    const transaction = {
      candidateFactProposal: {
        findMany: vi.fn(async () => [proposal]),
        updateMany,
        update: vi.fn(),
      },
      candidateProfile: { findUnique: vi.fn(async () => null) },
      candidateFact: { findMany: vi.fn(async () => []), create },
      auditEvent: { create: vi.fn() },
    };
    const database = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaClient;

    await expect(
      autoIngestSourceExplicitResumeFacts(database, { userId: "user-1" }),
    ).resolves.toEqual({ importedCount: 1, reviewCount: 0 });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        factType: "PROFILE_EMAIL",
        sourceProposalId: "proposal-1",
        userId: "user-1",
      }),
      select: { id: true },
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING", userId: "user-1" }),
        data: expect.objectContaining({ status: "ACCEPTED" }),
      }),
    );
    expect(mocks.invalidatePackets).toHaveBeenCalled();
  });

  it("leaves a source value pending when it conflicts with candidate-authored profile data", async () => {
    const transaction = {
      candidateFactProposal: {
        findMany: vi.fn(async () => [
          {
            id: "proposal-1",
            confidence: 0.98,
            factType: "PROFILE_EMAIL",
            proposedValue: { text: "resume@example.test" },
            sourceRegion: { text: "Email: resume@example.test" },
            targetPath: "candidateFacts.profileEmails",
          },
        ]),
        updateMany: vi.fn(),
      },
      candidateProfile: {
        findUnique: vi.fn(async () => ({
          applicationEmail: "candidate@example.test",
        })),
      },
      candidateFact: { findMany: vi.fn(async () => []) },
    };
    const database = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaClient;
    await expect(
      autoIngestSourceExplicitResumeFacts(database, { userId: "user-1" }),
    ).resolves.toEqual({ importedCount: 0, reviewCount: 1 });
    expect(transaction.candidateFactProposal.updateMany).not.toHaveBeenCalled();
  });

  it("does not create a second conflicting scalar résumé fact", async () => {
    const transaction = {
      candidateFactProposal: {
        findMany: vi.fn(async () => [
          {
            id: "proposal-2",
            confidence: 0.98,
            factType: "PROFILE_PROFESSIONAL_TITLE",
            proposedValue: { text: "Sales" },
            sourceRegion: { text: "Professional title: Sales" },
            targetPath: "candidateFacts.professionalTitles",
          },
        ]),
        updateMany: vi.fn(),
      },
      candidateProfile: { findUnique: vi.fn(async () => null) },
      candidateFact: {
        findMany: vi.fn(async () => [
          {
            id: "fact-1",
            factType: "PROFILE_PROFESSIONAL_TITLE",
            value: { text: "Security" },
          },
        ]),
      },
    };
    const database = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaClient;
    await expect(
      autoIngestSourceExplicitResumeFacts(database, { userId: "user-1" }),
    ).resolves.toEqual({ importedCount: 0, reviewCount: 1 });
    expect(transaction.candidateFactProposal.updateMany).not.toHaveBeenCalled();
  });
});
