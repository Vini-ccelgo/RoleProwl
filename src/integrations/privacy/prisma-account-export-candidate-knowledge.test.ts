import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { databaseClient, database } = vi.hoisted(() => {
  const database = {
    user: { findUniqueOrThrow: vi.fn() },
    applicationPolicy: { findUnique: vi.fn(async () => null) },
    answerMemory: { findMany: vi.fn(async () => []) },
    application: { findMany: vi.fn(async () => []) },
    resumeVersion: { findMany: vi.fn(async () => []) },
    applicationWritingArtifact: { findMany: vi.fn(async () => []) },
    notification: { findMany: vi.fn(async () => []) },
    productEvent: { findMany: vi.fn(async () => []) },
    auditEvent: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
    },
  };
  return { database, databaseClient: vi.fn(() => database) };
});

vi.mock("@/lib/db/client", () => ({ databaseClient }));

import { exportAccountData } from "./prisma-account-export";

describe("candidate knowledge account export", () => {
  it("includes candidate-owned narratives and their review proposals", async () => {
    database.user.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: "candidate-a",
        email: "candidate@example.test",
        authProvider: "test",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      })
      .mockResolvedValueOnce({
        candidateNarratives: [
          {
            id: "narrative-1",
            content: "Candidate-owned context",
            proposals: [{ id: "proposal-1", status: "PENDING" }],
          },
        ],
      });
    const result = await exportAccountData("candidate-a");
    expect(result.data.candidate).toEqual(
      expect.objectContaining({
        candidateNarratives: [
          expect.objectContaining({
            id: "narrative-1",
            proposals: [expect.objectContaining({ id: "proposal-1" })],
          }),
        ],
      }),
    );
    expect(database.user.findUniqueOrThrow.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        where: { id: "candidate-a" },
        select: expect.objectContaining({
          candidateNarratives: {
            include: { proposals: true },
            orderBy: { createdAt: "asc" },
          },
        }),
      }),
    );
  });
});
