import { describe, expect, it } from "vitest";
import { DeterministicAIProvider } from "@/integrations/ai/deterministic-ai-provider";
import { LocalPersonalAIProvider } from "@/integrations/ai/local-personal-ai-provider";
import { personalResultFixture } from "./personal-test-fixture";
import {
  acceptGroundedSemanticResult,
  enhancePersonalResults,
} from "./personal-semantic";

describe("personal local semantic ranking", () => {
  it("rejects unsupported positive claims while retaining exact resume evidence", () => {
    const accepted = acceptGroundedSemanticResult("Skills: Linux and SIEM", {
      scoreAdjustment: 5,
      summary: "Relevant defensive-security evidence.",
      strongMatches: [
        {
          label: "Linux",
          explanation: "Direct overlap",
          resumeEvidenceQuote: "Linux and SIEM",
        },
        {
          label: "Kubernetes production",
          explanation: "Claimed experience",
          resumeEvidenceQuote: "Kubernetes production experience",
        },
      ],
      partialMatches: [],
      gaps: [],
      unknowns: [],
    });
    expect(accepted.strongMatches).toHaveLength(1);
    expect(accepted.strongMatches[0].label).toBe("Linux");
  });

  it("reranks only with bounded adjustments and grounded evidence", async () => {
    const ai = new DeterministicAIProvider(() => ({
      scoreAdjustment: 7,
      summary: "Linux evidence transfers to this role.",
      strongMatches: [
        {
          label: "Linux operations",
          explanation: "Relevant terminology",
          resumeEvidenceQuote: "Skills: Linux",
        },
      ],
      partialMatches: [],
      gaps: [],
      unknowns: [],
    }));
    const enhanced = await enhancePersonalResults({
      ai,
      result: personalResultFixture(),
      resume: "Skills: Linux",
      limit: 1,
    });
    expect(enhanced.warnings).toEqual([]);
    expect(enhanced.result.mode).toBe("LOCAL_AI_ENHANCED");
    expect(enhanced.result.jobs[0].fitScore).toBe(89);
    expect(enhanced.result.jobs[0].strongMatches.at(-1)?.code).toBe(
      "SEMANTIC_STRENGTH",
    );
  });

  it("refuses non-loopback local AI endpoints", () => {
    expect(
      () =>
        new LocalPersonalAIProvider({
          baseUrl: "https://ai.example.com",
          model: "example",
        }),
    ).toThrow(/loopback/u);
  });
});
