import { describe, expect, it, vi } from "vitest";

const { eventCreate, findFirstOrThrow, findUniqueOrThrow, updateMany } =
  vi.hoisted(() => ({
    eventCreate: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    $transaction: vi.fn(async (callback) =>
      callback({
        application: { findFirstOrThrow, findUniqueOrThrow, updateMany },
        applicationEvent: { create: eventCreate },
        auditEvent: { create: vi.fn() },
      }),
    ),
  })),
}));
vi.mock("@/features/notifications/notification-preferences", () => ({
  notificationAllowed: vi.fn(async () => false),
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

  it("persists candidate confirmation time and explicit provenance", async () => {
    const current = {
      id: "application-1",
      state: "READY",
      userId: "user-1",
      submissionDestination: "https://boards.greenhouse.io/acme/jobs/42",
      submissionMechanism: "EXTERNAL_APPLICATION",
      submissionPayloadSnapshot: {
        packet: { version: "application-packet-v1" },
      },
    };
    const submittedAt = new Date("2026-09-06T13:00:00Z");
    findFirstOrThrow.mockResolvedValueOnce(current);
    updateMany.mockResolvedValueOnce({ count: 1 });
    findUniqueOrThrow.mockResolvedValueOnce({ ...current, state: "SUBMITTED" });
    await new PrismaApplicationSubmissionRepository().markSubmitted(
      "application-1",
      "user-1",
      { externalId: "external:application-1", submittedAt },
      "USER_CONFIRMED_EXTERNAL",
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "SUBMITTED",
          submittedAt,
          externalConfirmedAt: submittedAt,
          externalSubmissionId: "external:application-1",
        }),
      }),
    );
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "SUBMISSION_CONFIRMED",
          detail: {
            confirmation: "USER_CONFIRMED_EXTERNAL",
            roleProwlConfirmationReference: "external:application-1",
          },
        }),
      }),
    );
  });
});
