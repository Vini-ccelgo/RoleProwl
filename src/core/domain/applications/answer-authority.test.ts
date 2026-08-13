import { describe, expect, it } from "vitest";
import { decideAnswerAuthority } from "./answer-authority";

describe("sensitive and consequential answer authority", () => {
  it("never infers sensitive personal data", () => {
    expect(
      decideAnswerAuthority({ classification: "SENSITIVE_PERSONAL_DATA" }),
    ).toEqual({
      disposition: "NEEDS_REVIEW",
      handling: "NO_INFERENCE",
      reasonCode: "SENSITIVE_NO_INFERENCE",
    });
  });

  it("still requires review when a sensitive answer exists", () => {
    expect(
      decideAnswerAuthority({
        classification: "SENSITIVE_PERSONAL_DATA",
        answer: { source: "USER_POLICY", memoryStatus: "FRESH" },
      }).disposition,
    ).toBe("NEEDS_REVIEW");
  });

  it("requires an explicit fresh consequential answer", () => {
    expect(
      decideAnswerAuthority({
        classification: "LEGAL_OR_CONSEQUENTIAL",
        answer: { source: "PROFILE_FACT", memoryStatus: "FRESH" },
      }).disposition,
    ).toBe("NEEDS_REVIEW");
    expect(
      decideAnswerAuthority({
        classification: "LEGAL_OR_CONSEQUENTIAL",
        answer: {
          source: "EXPLICIT_CONSEQUENTIAL",
          memoryStatus: "STALE",
        },
      }).disposition,
    ).toBe("NEEDS_REVIEW");
    expect(
      decideAnswerAuthority({
        classification: "LEGAL_OR_CONSEQUENTIAL",
        answer: {
          source: "EXPLICIT_CONSEQUENTIAL",
          memoryStatus: "FRESH",
        },
      }).disposition,
    ).toBe("AUTO_ANSWER");
  });

  it("never automatically accepts attestations", () => {
    expect(
      decideAnswerAuthority({
        classification: "ATTESTATION",
        answer: {
          source: "EXPLICIT_CONSEQUENTIAL",
          memoryStatus: "FRESH",
        },
      }),
    ).toMatchObject({ disposition: "NEEDS_REVIEW", handling: "NO_INFERENCE" });
  });

  it("permits a grounded draft but does not treat it as an answer", () => {
    expect(
      decideAnswerAuthority({ classification: "JOB_SPECIFIC_FREE_TEXT" }),
    ).toMatchObject({
      disposition: "PREPARE_DRAFT",
      handling: "DRAFT_ALLOWED",
    });
  });

  it("blocks stale ordinary memories and unknown questions", () => {
    expect(
      decideAnswerAuthority({
        classification: "USER_POLICY",
        answer: { source: "USER_POLICY", memoryStatus: "STALE" },
      }).disposition,
    ).toBe("NEEDS_REVIEW");
    expect(
      decideAnswerAuthority({ classification: "UNKNOWN" }).disposition,
    ).toBe("NEEDS_REVIEW");
  });
});
