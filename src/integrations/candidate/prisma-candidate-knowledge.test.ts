import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/core/errors/application-errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ databaseClient: vi.fn() }));

const { invalidateReadyApplicationPackets } = vi.hoisted(() => ({
  invalidateReadyApplicationPackets: vi.fn(async () => 0),
}));
vi.mock("@/integrations/applications/invalidate-application-packets", () => ({
  invalidateReadyApplicationPackets,
}));

import {
  getCandidateKnowledgeSnapshot,
  reviewCandidateKnowledgeProposal,
  saveDirectCandidateKnowledge,
} from "./prisma-candidate-knowledge";

function database(proposalUserId = "candidate-a") {
  const proposal = {
    id: "proposal-1",
    userId: proposalUserId,
    narrativeId: "narrative-1",
    concept: "TARGET_ROLE",
    proposedValue: { text: "Security engineer" },
    origin: "EXPLICIT",
    status: "PENDING",
  };
  const transaction = {
    candidateKnowledgeProposal: {
      findFirst: vi.fn(async ({ where }) =>
        where.userId === proposalUserId ? proposal : null,
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    answerMemory: { upsert: vi.fn(async () => ({ id: "memory-1" })) },
    auditEvent: { create: vi.fn(async () => ({})) },
    application: { findMany: vi.fn(async () => []), updateMany: vi.fn() },
    applicationEvent: { create: vi.fn() },
  };
  return {
    transaction,
    client: {
      $transaction: vi.fn(async (run) => run(transaction)),
    },
  };
}

describe("candidate knowledge proposal review persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps AI extraction pending until the candidate approves it", async () => {
    const db = database();
    await expect(
      reviewCandidateKnowledgeProposal(db.client as never, {
        userId: "candidate-a",
        proposalId: "proposal-1",
        decision: "APPROVE",
      }),
    ).resolves.toEqual({ status: "APPROVED", memoryId: "memory-1" });
    expect(db.transaction.answerMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          candidateApproved: true,
          reusable: true,
          sourceNarrativeId: "narrative-1",
        }),
      }),
    );
  });

  it("stores a candidate correction without altering the proposal or original narrative", async () => {
    const db = database();
    await reviewCandidateKnowledgeProposal(db.client as never, {
      userId: "candidate-a",
      proposalId: "proposal-1",
      decision: "CORRECT",
      correctedValue: { text: "Application security engineer" },
    });
    expect(
      db.transaction.candidateKnowledgeProposal.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CORRECTED",
          acceptedValue: { text: "Application security engineer" },
        }),
      }),
    );
    expect(db.transaction.answerMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          answer: { text: "Application security engineer" },
        }),
      }),
    );
    expect(db.transaction).not.toHaveProperty("candidateNarrative.update");
  });

  it("lets the candidate decline reuse without creating an answer memory", async () => {
    const db = database();
    await expect(
      reviewCandidateKnowledgeProposal(db.client as never, {
        userId: "candidate-a",
        proposalId: "proposal-1",
        decision: "DECLINE",
      }),
    ).resolves.toEqual({ status: "DECLINED", memoryId: null });
    expect(db.transaction.answerMemory.upsert).not.toHaveBeenCalled();
  });

  it("does not let Candidate A review Candidate B's proposal", async () => {
    const db = database("candidate-b");
    await expect(
      reviewCandidateKnowledgeProposal(db.client as never, {
        userId: "candidate-a",
        proposalId: "proposal-1",
        decision: "APPROVE",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(db.transaction.answerMemory.upsert).not.toHaveBeenCalled();
  });

  it("audits only concept identity and decision, never candidate content", async () => {
    const db = database();
    await reviewCandidateKnowledgeProposal(db.client as never, {
      userId: "candidate-a",
      proposalId: "proposal-1",
      decision: "APPROVE",
    });
    const serialized = JSON.stringify(
      db.transaction.auditEvent.create.mock.calls,
    );
    expect(serialized).toContain("TARGET_ROLE");
    expect(serialized).not.toContain("Security engineer");
  });

  it("owner-scopes every table read in a candidate snapshot", async () => {
    const findUnique = vi.fn(async (input: unknown) => {
      void input;
      return null;
    });
    const findMany = vi.fn(async (input: unknown) => {
      void input;
      return [];
    });
    const db = {
      candidateProfile: { findUnique },
      workExperience: { findMany },
      education: { findMany },
      skill: { findMany },
      project: { findMany },
      credential: { findMany },
      candidateFact: { findMany },
      candidatePreferences: { findUnique },
      workAuthorizationProfile: { findUnique },
      answerMemory: { findMany },
      candidateNarrative: { findMany },
      candidateKnowledgeProposal: { findMany },
    };
    await getCandidateKnowledgeSnapshot(
      "candidate-a",
      new Date("2026-09-12T00:00:00Z"),
      db as never,
    );
    for (const call of [...findUnique.mock.calls, ...findMany.mock.calls]) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "candidate-a" }),
        }),
      );
    }
  });

  it("stores optional current compensation with explicit structure and confirmation time", async () => {
    const db = database();
    const confirmedAt = new Date("2026-09-12T12:00:00Z");
    await saveDirectCandidateKnowledge(
      {
        userId: "candidate-a",
        concept: "CURRENT_COMPENSATION",
        answer: { amount: 10_000, currency: "BRL", period: "monthly" },
        confirmedAt,
      },
      db.client as never,
    );
    expect(db.transaction.answerMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_concept: {
            userId: "candidate-a",
            concept: "CURRENT_COMPENSATION",
          },
        },
        create: expect.objectContaining({
          answer: { amount: 10_000, currency: "BRL", period: "monthly" },
          source: "EXPLICIT_CONSEQUENTIAL",
          verifiedAt: confirmedAt,
          reverifyAfterDays: 30,
        }),
      }),
    );
  });
});
