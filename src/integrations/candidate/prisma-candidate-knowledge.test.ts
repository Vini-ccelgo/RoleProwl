import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotFoundError,
  ValidationError,
} from "@/core/errors/application-errors";
import { buildApplicationPacket } from "@/core/domain/applications/application-packet";

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
  invalidateProfessionalHistoryAuthorities,
  reconfirmDirectCandidateKnowledge,
  removeDirectCandidateKnowledge,
  reviewCandidateKnowledgeProposal,
  saveDirectCandidateKnowledge,
  saveDirectCandidateKnowledgeBatch,
  setProfessionalHistoryAuthorities,
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
    answerMemory: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      upsert: vi.fn(async ({ where }) => ({
        id:
          where.userId_concept.concept === "TARGET_ROLE"
            ? "memory-1"
            : `memory-${where.userId_concept.concept}`,
      })),
    },
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

function snapshotDatabase(input?: {
  applicationSnapshots?: Array<Record<string, unknown>>;
  memories?: Array<Record<string, unknown>>;
  narratives?: Array<Record<string, unknown>>;
  profile?: Record<string, unknown> | null;
}) {
  let memories = input?.memories ?? [];
  const candidateFactDelete = vi.fn();
  const transaction = {
    answerMemory: {
      findMany: vi.fn(async ({ where }) =>
        memories.filter(
          (memory) =>
            memory.userId === where.userId &&
            (!where.concept?.in || where.concept.in.includes(memory.concept)),
        ),
      ),
      findFirst: vi.fn(
        async ({ where }) =>
          memories.find(
            (memory) =>
              memory.userId === where.userId &&
              memory.concept === where.concept,
          ) ?? null,
      ),
      deleteMany: vi.fn(async ({ where }) => {
        const before = memories.length;
        memories = memories.filter(
          (memory) =>
            memory.userId !== where.userId || memory.concept !== where.concept,
        );
        return { count: before - memories.length };
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        memories = memories.map((memory) => {
          if (
            memory.id !== where.id ||
            memory.userId !== where.userId ||
            memory.concept !== where.concept
          )
            return memory;
          count += 1;
          return { ...memory, ...data };
        });
        return { count };
      }),
      upsert: vi.fn(async () => ({ id: "memory-upserted" })),
    },
    candidateFact: { deleteMany: candidateFactDelete },
    auditEvent: { create: vi.fn(async () => ({})) },
    application: { findMany: vi.fn(async () => []), updateMany: vi.fn() },
    applicationEvent: { create: vi.fn() },
  };
  const emptyMany = { findMany: vi.fn(async () => []) };
  const client = {
    $transaction: vi.fn(async (run) => run(transaction)),
    candidateProfile: {
      findUnique: vi.fn(async ({ where }) =>
        where.userId === "candidate-a" ? (input?.profile ?? null) : null,
      ),
    },
    workExperience: emptyMany,
    education: emptyMany,
    skill: emptyMany,
    project: emptyMany,
    credential: emptyMany,
    candidateFact: { findMany: vi.fn(async () => []) },
    candidatePreferences: { findUnique: vi.fn(async () => null) },
    workAuthorizationProfile: { findUnique: vi.fn(async () => null) },
    answerMemory: {
      findMany: vi.fn(async ({ where }) =>
        memories.filter((memory) => memory.userId === where.userId),
      ),
    },
    candidateNarrative: {
      findMany: vi.fn(async ({ where }) =>
        (input?.narratives ?? []).filter(
          (narrative) => narrative.userId === where.userId,
        ),
      ),
    },
    candidateKnowledgeProposal: { findMany: vi.fn(async () => []) },
    application: {
      findMany: vi.fn(async ({ where }) =>
        where.userId === "candidate-a"
          ? (input?.applicationSnapshots ?? []).map(
              (submissionPayloadSnapshot) => ({ submissionPayloadSnapshot }),
            )
          : [],
      ),
    },
  };
  return { candidateFactDelete, client, transaction };
}

function languageApplicationPacket(rawValue: string, label: string) {
  return buildApplicationPacket({
    reviewed: false,
    source: {
      accountEmail: "candidate@example.test",
      profile: null,
      verifiedResumeFacts: [],
      experience: [],
      education: [],
      credentials: [],
      skills: [],
      languages: [],
      workAuthorization: null,
      sponsorshipRequired: null,
      answerMemories: [],
      selectedResume: null,
      coverLetter: null,
      questions: [
        {
          id: "english-proficiency",
          source: "GREENHOUSE",
          group: "STANDARD",
          label: "English proficiency",
          required: true,
          fieldNames: ["english_proficiency"],
          fieldTypes: ["multi_value_single_select"],
          options: [label],
          optionIdentities: [{ label, value: rawValue }],
        },
      ],
      questionResolutions: [
        {
          questionId: "english-proficiency",
          canonicalConcept: "LANGUAGE_PROFICIENCY:english",
          disposition: "AUTO_RESOLVED",
          value: rawValue,
          candidateKnowledgeReferences: ["memory-language"],
          reasonCode: "APPROVED_REUSABLE_KNOWLEDGE",
        },
      ],
      questionInspection: "AVAILABLE",
      sourceName: "GREENHOUSE",
      targetRole: "Engineer",
    },
  });
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

  it("stores both professional-history authorities atomically as finite policy values", async () => {
    const db = database();
    await expect(
      setProfessionalHistoryAuthorities(
        {
          userId: "candidate-a",
          complete: true,
          negativeInference: true,
          confirmedAt: new Date("2026-09-20T12:00:00.000Z"),
        },
        db.client as never,
      ),
    ).resolves.toEqual({ complete: true, negativeInference: true });
    expect(db.transaction.answerMemory.upsert).toHaveBeenCalledTimes(2);
    expect(db.transaction.answerMemory.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          concept: "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
          answer: { attested: true },
          autoAnswerAllowed: false,
        }),
      }),
    );
    expect(db.transaction.answerMemory.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          concept: "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
          answer: { authorized: true },
          autoAnswerAllowed: false,
        }),
      }),
    );
    expect(invalidateReadyApplicationPackets).toHaveBeenCalledTimes(1);
  });

  it("clears both authorities with bounded metadata after history changes", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "memory-complete",
        concept: "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
      },
      {
        id: "memory-negative",
        concept: "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
      },
    ]);
    const deleteMany = vi.fn(async () => ({ count: 2 }));
    const auditCreate = vi.fn(async () => ({}));
    await expect(
      invalidateProfessionalHistoryAuthorities(
        {
          answerMemory: { findMany, deleteMany },
          auditEvent: { create: auditCreate },
        } as never,
        "candidate-a",
      ),
    ).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["memory-complete", "memory-negative"] },
        userId: "candidate-a",
        concept: {
          in: [
            "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
            "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
          ],
        },
      },
    });
    const serialized = JSON.stringify(auditCreate.mock.calls);
    expect(serialized).toContain("HISTORY_CHANGED");
    expect(serialized).not.toContain("resume");
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

  it("projects known recurring details and saved jurisdictions separately from gaps", async () => {
    const verifiedAt = new Date("2026-09-14T12:00:00Z");
    const memory = (concept: string, answer: Record<string, unknown>) => ({
      id: `memory-${concept}`,
      userId: "candidate-a",
      concept,
      answer,
      autoAnswerAllowed: true,
      origin: "EXPLICIT",
      candidateApproved: true,
      reusable: true,
      verifiedAt,
    });
    const db = snapshotDatabase({
      memories: [
        memory("NOTICE_PERIOD", { text: "30 days" }),
        memory("WORK_AUTHORIZATION:BR", { status: "Authorized" }),
        memory("SPONSORSHIP_REQUIREMENT:BR", { required: false }),
        memory("WORK_AUTHORIZATION:US", { status: "Not authorized" }),
        memory("SPONSORSHIP_REQUIREMENT:US", { required: true }),
      ],
      narratives: [
        {
          id: "narrative-current",
          userId: "candidate-a",
          theme: "RECURRING_DETAILS",
          content: "My current recurring details.",
          createdAt: verifiedAt,
          updatedAt: verifiedAt,
        },
      ],
    });
    const snapshot = await getCandidateKnowledgeSnapshot(
      "candidate-a",
      verifiedAt,
      db.client as never,
    );
    expect(snapshot.currentDetails.map((item) => item.concept)).toContain(
      "NOTICE_PERIOD",
    );
    expect(snapshot.jurisdictions.map((item) => item.countryCode)).toEqual([
      "BR",
      "US",
    ]);
    expect(snapshot.jurisdictions[0]).toEqual(
      expect.objectContaining({
        countryCode: "BR",
        authorization: expect.objectContaining({ status: "KNOWN" }),
        sponsorship: expect.objectContaining({ status: "KNOWN" }),
      }),
    );
    expect(
      snapshot.gapPrompts.flatMap((prompt) => prompt.concepts),
    ).not.toContain("NOTICE_PERIOD");
    expect(snapshot.narratives[0]?.content).toBe(
      "My current recurring details.",
    );
  });

  it("repairs a historical employer option ID from retained packet semantics", async () => {
    const verifiedAt = new Date("2026-09-14T12:00:00Z");
    const db = snapshotDatabase({
      memories: [
        {
          id: "memory-language",
          userId: "candidate-a",
          concept: "LANGUAGE_PROFICIENCY:english",
          answer: { text: "22503962005" },
          autoAnswerAllowed: true,
          origin: "EXPLICIT",
          candidateApproved: true,
          reusable: true,
          verifiedAt,
        },
      ],
      applicationSnapshots: [
        { packet: languageApplicationPacket("22503962005", "Fluent") },
      ],
    });
    const snapshot = await getCandidateKnowledgeSnapshot(
      "candidate-a",
      verifiedAt,
      db.client as never,
    );
    expect(
      snapshot.coverage.find(
        (item) => item.concept === "LANGUAGE_PROFICIENCY:english",
      )?.result.value,
    ).toEqual({ text: "Fluent" });
    expect(db.transaction.answerMemory.updateMany).toHaveBeenCalledWith({
      where: {
        id: "memory-language",
        userId: "candidate-a",
        concept: "LANGUAGE_PROFICIENCY:english",
      },
      data: { answer: { text: "Fluent" } },
    });
    const audit = JSON.stringify(db.transaction.auditEvent.create.mock.calls);
    expect(audit).toContain("SEMANTIC_REPAIR");
    expect(audit).not.toContain("22503962005");
    expect(audit).not.toContain("Fluent");
  });

  it("removes an unrecoverable opaque choice ID and requires reconfirmation", async () => {
    const verifiedAt = new Date("2026-09-14T12:00:00Z");
    const db = snapshotDatabase({
      memories: [
        {
          id: "memory-language",
          userId: "candidate-a",
          concept: "LANGUAGE_PROFICIENCY:spanish",
          answer: { text: "22503965005" },
          autoAnswerAllowed: true,
          origin: "EXPLICIT",
          candidateApproved: true,
          reusable: true,
          verifiedAt,
        },
      ],
    });
    const snapshot = await getCandidateKnowledgeSnapshot(
      "candidate-a",
      verifiedAt,
      db.client as never,
    );
    expect(snapshot.invalidatedReusableConcepts).toEqual([
      "LANGUAGE_PROFICIENCY:spanish",
    ]);
    expect(
      snapshot.coverage.find(
        (item) => item.concept === "LANGUAGE_PROFICIENCY:spanish",
      ),
    ).toBeUndefined();
    expect(db.transaction.answerMemory.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "memory-language",
        userId: "candidate-a",
        concept: "LANGUAGE_PROFICIENCY:spanish",
      },
    });
  });

  it("rejects opaque employer identities at the reusable-memory boundary", async () => {
    const db = database();
    await expect(
      saveDirectCandidateKnowledge(
        {
          userId: "candidate-a",
          concept: "LANGUAGE_PROFICIENCY:english",
          answer: { text: "22503962005" },
        },
        db.client as never,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.transaction.answerMemory.upsert).not.toHaveBeenCalled();
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

  it("edits one canonical memory row with renewed candidate authority", async () => {
    const db = database();
    const confirmedAt = new Date("2026-09-14T12:00:00Z");
    await saveDirectCandidateKnowledge(
      {
        userId: "candidate-a",
        concept: "NOTICE_PERIOD",
        answer: { text: "45 days" },
        confirmedAt,
      },
      db.client as never,
    );
    expect(db.transaction.answerMemory.upsert).toHaveBeenCalledOnce();
    expect(db.transaction.answerMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_concept: {
            userId: "candidate-a",
            concept: "NOTICE_PERIOD",
          },
        },
        update: expect.objectContaining({
          answer: { text: "45 days" },
          autoAnswerAllowed: true,
          candidateApproved: true,
          reusable: true,
          verifiedAt: confirmedAt,
        }),
      }),
    );
  });

  it("reconfirms a stale value without requiring re-entry", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00Z");
    const confirmedAt = new Date("2026-09-14T12:00:00Z");
    const db = snapshotDatabase({
      memories: [
        {
          id: "memory-1",
          userId: "candidate-a",
          concept: "NOTICE_PERIOD",
          answer: { text: "30 days" },
          autoAnswerAllowed: true,
          origin: "EXPLICIT",
          candidateApproved: true,
          reusable: true,
          verifiedAt,
        },
      ],
    });
    await reconfirmDirectCandidateKnowledge(
      { userId: "candidate-a", concept: "NOTICE_PERIOD", confirmedAt },
      db.client as never,
    );
    expect(db.transaction.answerMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          answer: { text: "30 days" },
          verifiedAt: confirmedAt,
        }),
      }),
    );
  });

  it("clears only the owner's answer-memory override and falls back to profile evidence", async () => {
    const now = new Date("2026-09-14T12:00:00Z");
    const db = snapshotDatabase({
      profile: {
        id: "profile-a",
        userId: "candidate-a",
        firstName: "Maya",
        lastName: "Chen",
        applicationEmail: null,
        phone: null,
        location: "São Paulo, Brazil",
        websiteUrl: null,
        linkedInUrl: null,
        updatedAt: now,
      },
      memories: [
        {
          id: "memory-a",
          userId: "candidate-a",
          concept: "CURRENT_LOCATION",
          answer: { text: "Curitiba, Brazil" },
          autoAnswerAllowed: true,
          origin: "EXPLICIT",
          candidateApproved: true,
          reusable: true,
          verifiedAt: now,
        },
        {
          id: "memory-b",
          userId: "candidate-b",
          concept: "CURRENT_LOCATION",
          answer: { text: "Boston, US" },
          autoAnswerAllowed: true,
          origin: "EXPLICIT",
          candidateApproved: true,
          reusable: true,
          verifiedAt: now,
        },
      ],
    });
    await removeDirectCandidateKnowledge(
      { userId: "candidate-a", concept: "CURRENT_LOCATION" },
      db.client as never,
    );
    const snapshot = await getCandidateKnowledgeSnapshot(
      "candidate-a",
      now,
      db.client as never,
    );
    expect(
      snapshot.coverage.find((item) => item.concept === "CURRENT_LOCATION")
        ?.result.value,
    ).toEqual({ text: "São Paulo, Brazil" });
    expect(db.transaction.answerMemory.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "memory-a",
        userId: "candidate-a",
        concept: "CURRENT_LOCATION",
      },
    });
    expect(db.candidateFactDelete).not.toHaveBeenCalled();
    expect(
      JSON.stringify(db.transaction.auditEvent.create.mock.calls),
    ).not.toContain("Curitiba");
  });

  it("fails a cross-user clear without touching the other candidate's memory", async () => {
    const db = snapshotDatabase({
      memories: [
        {
          id: "memory-b",
          userId: "candidate-b",
          concept: "NOTICE_PERIOD",
        },
      ],
    });
    await expect(
      removeDirectCandidateKnowledge(
        { userId: "candidate-a", concept: "NOTICE_PERIOD" },
        db.client as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(db.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("stores a residual answer batch in one transaction and invalidates packets once", async () => {
    const db = database();
    await saveDirectCandidateKnowledgeBatch(
      [
        {
          userId: "candidate-a",
          concept: "NOTICE_PERIOD",
          answer: { text: "30 days" },
        },
        {
          userId: "candidate-a",
          concept: "LANGUAGE_PROFICIENCY:english",
          answer: { text: "Professional fluent" },
          confirmedAt: new Date("2026-09-13T00:00:00Z"),
          resolvesConflicts: true,
        },
      ],
      db.client as never,
    );
    expect(db.client.$transaction).toHaveBeenCalledOnce();
    expect(db.transaction.answerMemory.upsert).toHaveBeenCalledTimes(2);
    expect(db.transaction.answerMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          answer: {
            text: "Professional fluent",
            _candidateConflictResolvedAt: "2026-09-13T00:00:00.000Z",
          },
        }),
      }),
    );
    expect(invalidateReadyApplicationPackets).toHaveBeenCalledOnce();
    const audit = JSON.stringify(db.transaction.auditEvent.create.mock.calls);
    expect(audit).not.toContain("30 days");
    expect(audit).not.toContain("Professional fluent");
  });

  it("persists authorization answers under independent jurisdiction keys", async () => {
    const db = database();
    await saveDirectCandidateKnowledgeBatch(
      [
        {
          userId: "candidate-a",
          concept: "WORK_AUTHORIZATION:BR",
          answer: { text: "Yes" },
        },
        {
          userId: "candidate-a",
          concept: "WORK_AUTHORIZATION:US",
          answer: { text: "No" },
        },
      ],
      db.client as never,
    );
    expect(db.transaction.answerMemory.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          userId_concept: {
            userId: "candidate-a",
            concept: "WORK_AUTHORIZATION:BR",
          },
        },
        create: expect.objectContaining({ reverifyAfterDays: 90 }),
      }),
    );
    expect(db.transaction.answerMemory.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId_concept: {
            userId: "candidate-a",
            concept: "WORK_AUTHORIZATION:US",
          },
        },
        create: expect.objectContaining({ reverifyAfterDays: 90 }),
      }),
    );
  });
});
