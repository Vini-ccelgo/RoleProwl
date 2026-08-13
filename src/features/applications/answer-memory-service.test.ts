import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/core/errors/application-errors";
import { rememberApplicationAnswer } from "./answer-memory-service";

describe("rememberApplicationAnswer", () => {
  it("upserts differently worded questions under one canonical concept", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "memory-1" });
    await rememberApplicationAnswer({
      answer: { value: true },
      autoAnswerAllowed: true,
      question: "Will you now or in the future need visa sponsorship?",
      repository: { upsert },
      source: "EXPLICIT_CONSEQUENTIAL",
      userId: "user-1",
      verifiedAt: new Date("2026-08-13T00:00:00.000Z"),
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        concept: "US_FUTURE_SPONSORSHIP",
        reverifyAfterDays: 90,
        answer: { value: true },
      }),
    );
  });

  it("requires an explicit canonical concept for unmatched wording", async () => {
    await expect(
      rememberApplicationAnswer({
        answer: { value: "answer" },
        autoAnswerAllowed: false,
        question: "Unknown organization-specific question",
        repository: { upsert: vi.fn() },
        source: "USER_POLICY",
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not store an empty canonical answer", async () => {
    await expect(
      rememberApplicationAnswer({
        answer: {},
        autoAnswerAllowed: false,
        concept: "DESIRED_SALARY",
        repository: { upsert: vi.fn() },
        source: "USER_POLICY",
        userId: "user-1",
      }),
    ).rejects.toThrow("cannot be empty");
  });
});
