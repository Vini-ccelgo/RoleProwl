import { describe, expect, it } from "vitest";
import {
  answerMemoryCanAutoAnswer,
  answerMemoryStatus,
  mapQuestionToAnswerConcept,
} from "./answer-memory";

describe("answer memory concepts", () => {
  it.each([
    [
      "Will you now or in the future need visa sponsorship?",
      "US_FUTURE_SPONSORSHIP",
    ],
    ["Do you require immigration sponsorship?", "US_FUTURE_SPONSORSHIP"],
    [
      "Are you eligible to work within the United States?",
      "US_WORK_AUTHORIZATION",
    ],
    ["What are your compensation expectations?", "DESIRED_SALARY"],
    ["Are you open to relocate?", "WILLING_TO_RELOCATE"],
    [
      "What is your preferred work setting: remote, hybrid, or onsite?",
      "REMOTE_PREFERENCE",
    ],
    ["What is your notice period?", "START_AVAILABILITY"],
    ["Where do you currently reside?", "CURRENT_LOCATION"],
    ["Are you able to travel up to 20 percent?", "TRAVEL_AVAILABILITY"],
  ] as const)("maps semantic wording for %s", (question, expected) => {
    expect(mapQuestionToAnswerConcept(question)).toBe(expected);
  });

  it("does not force an unknown question into a concept", () => {
    expect(
      mapQuestionToAnswerConcept("What makes a good platform?"),
    ).toBeNull();
  });
});

describe("answer memory staleness", () => {
  const base = {
    autoAnswerAllowed: true,
    concept: "US_FUTURE_SPONSORSHIP",
    reverifyAfterDays: 90,
    verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("allows a fresh explicitly enabled answer", () => {
    expect(
      answerMemoryCanAutoAnswer(base, new Date("2026-03-01T00:00:00.000Z")),
    ).toBe(true);
  });

  it("marks consequential answers stale at the re-verification boundary", () => {
    expect(answerMemoryStatus(base, new Date("2026-04-01T00:00:00.000Z"))).toBe(
      "STALE",
    );
  });

  it("never auto-answers a memory without explicit permission", () => {
    expect(answerMemoryStatus({ ...base, autoAnswerAllowed: false })).toBe(
      "NOT_AUTO_ANSWERABLE",
    );
  });
});
