import { describe, expect, it } from "vitest";
import { isSourceExplicitAutoIngestProposal } from "./resume-auto-ingest";

function proposal(
  factType: string,
  text: string,
  overrides: Partial<{
    confidence: number;
    sourceText: string;
    targetPath: string;
  }> = {},
) {
  const paths: Record<string, string> = {
    PROFILE_FIRST_NAME: "candidateFacts.profileFirstNames",
    PROFILE_EMAIL: "candidateFacts.profileEmails",
    PROFILE_PROFESSIONAL_TITLE: "candidateFacts.professionalTitles",
    SKILL_TEXT: "candidateFacts.skills",
    LANGUAGE_TEXT: "candidateFacts.languages",
  };
  return {
    confidence: overrides.confidence ?? 0.98,
    factType,
    proposedValue: { text },
    sourceRegion: { text: overrides.sourceText ?? text },
    targetPath: overrides.targetPath ?? paths[factType]!,
  };
}

describe("source-explicit résumé auto-ingestion", () => {
  it("accepts grounded allowlisted profile and collection facts", () => {
    for (const item of [
      proposal("PROFILE_EMAIL", "maya@example.test", {
        sourceText: "Email: maya@example.test",
      }),
      proposal("PROFILE_PROFESSIONAL_TITLE", "Security Analyst", {
        sourceText: "Professional title: Security Analyst",
      }),
      proposal("SKILL_TEXT", "Incident response", { confidence: 0.55 }),
      proposal("LANGUAGE_TEXT", "English — Fluent", { confidence: 0.55 }),
    ])
      expect(
        isSourceExplicitAutoIngestProposal({
          proposal: item,
          peerProposals: [item],
          profile: null,
        }),
      ).toBe(true);
  });

  it("keeps ambiguous names and candidate-authored conflicts for review", () => {
    const maya = proposal("PROFILE_FIRST_NAME", "Maya");
    const maria = proposal("PROFILE_FIRST_NAME", "Maria");
    expect(
      isSourceExplicitAutoIngestProposal({
        proposal: maya,
        peerProposals: [maya, maria],
        profile: null,
      }),
    ).toBe(false);
    expect(
      isSourceExplicitAutoIngestProposal({
        proposal: proposal("PROFILE_EMAIL", "resume@example.test", {
          sourceText: "Email: resume@example.test",
        }),
        peerProposals: [
          proposal("PROFILE_EMAIL", "resume@example.test", {
            sourceText: "Email: resume@example.test",
          }),
        ],
        profile: { applicationEmail: "candidate@example.test" },
      }),
    ).toBe(false);
  });

  it("rejects unsupported inference even when its confidence is high", () => {
    const inferred = proposal("TARGET_ROLE", "Security", {
      targetPath: "answerMemory.targetRole",
    });
    expect(
      isSourceExplicitAutoIngestProposal({
        proposal: inferred,
        peerProposals: [inferred],
        profile: null,
      }),
    ).toBe(false);
  });
});
