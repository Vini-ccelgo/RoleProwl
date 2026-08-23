import { describe, expect, it, vi } from "vitest";

const { eventCreate, findFirstOrThrow, updateMany } = vi.hoisted(() => ({
  eventCreate: vi.fn(),
  findFirstOrThrow: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    $transaction: vi.fn(async (callback) =>
      callback({
        application: { findFirstOrThrow, updateMany },
        applicationEvent: { create: eventCreate },
      }),
    ),
  })),
}));

import { PrismaApplicationSubmissionRepository } from "./prisma-application-submission-repository";

describe("Prisma application submission idempotency", () => {
  it("returns an already submitted record without creating another event", async () => {
    findFirstOrThrow.mockResolvedValue({
      id: "application-1",
      state: "SUBMITTED",
      userId: "user-1",
      submissionDestination: "https://example.com/apply",
      submissionMechanism: "EXTERNAL_APPLICATION",
      submissionPayloadSnapshot: {
        answers: {},
        destinationUrl: "https://example.com/apply",
        documents: [],
        generatedText: {},
        idempotencyKey: "application:user-1:job-1",
        reference: { externalId: "job-1", source: "GREENHOUSE" },
        resumeVersionId: null,
      },
    });
    const result =
      await new PrismaApplicationSubmissionRepository().markSubmitted(
        "application-1",
        "user-1",
        { externalId: "external:application-1", submittedAt: new Date() },
        "USER_CONFIRMED_EXTERNAL",
      );
    expect(result.state).toBe("SUBMITTED");
    expect(updateMany).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });
});
