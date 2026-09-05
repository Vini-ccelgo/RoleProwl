import { beforeEach, describe, expect, it, vi } from "vitest";
const synchronizeVerifiedCandidateSkills = vi.hoisted(() =>
  vi.fn(async () => ({ changed: true })),
);
vi.mock("./sync-verified-candidate-skills", () => ({
  synchronizeVerifiedCandidateSkills,
}));
import { persistFactProposalDecision } from "./prisma-fact-proposal-review";

beforeEach(() => {
  vi.clearAllMocks();
});

function transactionFixture() {
  const proposals = new Map(
    ["TypeScript", "PostgreSQL"].map((text, index) => [
      `proposal-${index + 1}`,
      {
        id: `proposal-${index + 1}`,
        userId: "user-1",
        factType: "SKILL_TEXT",
        targetPath: "candidateFacts.skills",
        proposedValue: { text },
        status: "PENDING",
      },
    ]),
  );
  const factCreate = vi.fn(
    async ({ data }: { data: { sourceProposalId: string } }) => ({
      id: `fact-${data.sourceProposalId}`,
    }),
  );
  const proposalUpdate = vi.fn(async () => ({ count: 1 }));
  const auditCreate = vi.fn(async () => ({}));
  const matchDeleteMany = vi.fn(async () => ({ count: 1 }));
  const transaction = {
    candidateFactProposal: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; userId: string } }) => {
          const proposal = proposals.get(where.id);
          return proposal?.userId === where.userId ? proposal : null;
        },
      ),
      updateMany: proposalUpdate,
    },
    candidateFact: { create: factCreate },
    auditEvent: { create: auditCreate },
    jobMatchAnalysis: { deleteMany: matchDeleteMany },
  };
  return {
    auditCreate,
    factCreate,
    matchDeleteMany,
    proposalUpdate,
    transaction,
  };
}

describe("Prisma fact proposal review persistence", () => {
  it("persists original values with canonical linkage and provenance", async () => {
    const fixture = transactionFixture();
    const result = await persistFactProposalDecision(
      fixture.transaction as never,
      { decision: "ACCEPT", proposalId: "proposal-1", userId: "user-1" },
    );

    expect(fixture.factCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        factType: "SKILL_TEXT",
        value: { text: "TypeScript" },
        sourceProposalId: "proposal-1",
      },
      select: { id: true },
    });
    expect(fixture.proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACCEPTED",
          canonicalType: "CANDIDATE_FACT",
          canonicalId: "fact-proposal-1",
        }),
      }),
    );
    expect(result).toEqual({
      status: "ACCEPTED",
      canonicalFactId: "fact-proposal-1",
    });
    expect(fixture.matchDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(fixture.matchDeleteMany).toHaveBeenCalledTimes(1);
    expect(synchronizeVerifiedCandidateSkills).toHaveBeenCalledWith(
      fixture.transaction,
      "user-1",
    );
  });

  it("persists edited values and the edited review state", async () => {
    const fixture = transactionFixture();
    await persistFactProposalDecision(fixture.transaction as never, {
      decision: "EDIT_AND_ACCEPT",
      editedValue: { text: "TypeScript 5" },
      proposalId: "proposal-1",
      userId: "user-1",
    });

    expect(fixture.factCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ value: { text: "TypeScript 5" } }),
      }),
    );
    expect(fixture.proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "EDITED_AND_ACCEPTED" }),
      }),
    );
    expect(fixture.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CANDIDATE_FACT_CHANGED" }),
      }),
    );
  });

  it("rejects without creating canonical data", async () => {
    const fixture = transactionFixture();
    const result = await persistFactProposalDecision(
      fixture.transaction as never,
      { decision: "REJECT", proposalId: "proposal-1", userId: "user-1" },
    );

    expect(fixture.factCreate).not.toHaveBeenCalled();
    expect(fixture.auditCreate).not.toHaveBeenCalled();
    expect(synchronizeVerifiedCandidateSkills).not.toHaveBeenCalled();
    expect(fixture.proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED" }),
      }),
    );
    expect(result).toEqual({ status: "REJECTED", canonicalFactId: null });
  });

  it("appends multiple values instead of overwriting", async () => {
    const fixture = transactionFixture();
    for (const proposalId of ["proposal-1", "proposal-2"]) {
      await persistFactProposalDecision(fixture.transaction as never, {
        decision: "ACCEPT",
        proposalId,
        userId: "user-1",
      });
    }

    expect(fixture.factCreate).toHaveBeenCalledTimes(2);
    expect(fixture.factCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          value: { text: "PostgreSQL" },
          sourceProposalId: "proposal-2",
        }),
      }),
    );
  });
});
