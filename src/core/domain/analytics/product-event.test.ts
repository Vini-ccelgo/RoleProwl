import { describe, expect, it } from "vitest";
import { prepareProductEvent } from "./product-event";

describe("privacy-minimized product events", () => {
  it("retains only event-specific bounded properties", () => {
    expect(
      prepareProductEvent({
        dedupeKey: "review:user-1:decision-1",
        entityId: "decision-1",
        entityType: "applicationDecision",
        eventType: "REVIEW_REQUESTED",
        occurredAt: new Date("2026-08-13T12:00:00.000Z"),
        properties: {
          reasonCodes: ["QUESTION_REQUIRES_REVIEW"],
          candidateAnswer: "must not be retained",
          providerPayload: "must not be retained",
        },
        userId: "user-1",
      }),
    ).toMatchObject({
      properties: { reasonCodes: ["QUESTION_REQUIRES_REVIEW"] },
    });
  });

  it("bounds strings and arrays and rejects malformed identity fields", () => {
    const event = prepareProductEvent({
      dedupeKey: "job-rejected:user-1:job-1",
      entityId: "job-1",
      entityType: "job",
      eventType: "JOB_REJECTED",
      occurredAt: new Date(),
      properties: { reasonCode: "x".repeat(200), surface: "jobs" },
      userId: "user-1",
    });
    expect(event.properties.reasonCode).toHaveLength(100);
    expect(() =>
      prepareProductEvent({
        ...event,
        dedupeKey: "contains spaces",
      }),
    ).toThrow();
  });
});
