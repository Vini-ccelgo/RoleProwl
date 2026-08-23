import { describe, expect, it } from "vitest";
import type {
  MatchAssessment,
  MatchEvidence,
} from "@/core/domain/matching/match-job";
import {
  buildAssessmentGuidance,
  splitMatchEvidence,
} from "./match-presentation";

const item = (
  code: string,
  assessment: MatchAssessment,
  category: NonNullable<MatchEvidence["category"]> = "QUALIFICATION",
): MatchEvidence => ({
  assessment,
  category,
  code,
  evidence: "evidence",
  label: code,
});

describe("evidence-aware match presentation", () => {
  it("keeps preferences separate from qualification gaps and strengths", () => {
    const groups = splitMatchEvidence({
      conflicts: [item("AUTH", "CONFLICT")],
      gaps: [
        item("EXPERIENCE", "GAP"),
        item("REMOTE_PREFERENCE", "GAP", "PREFERENCE"),
      ],
      partials: [item("SKILL", "PARTIAL")],
      strengths: [item("EDUCATION", "SUPPORTED")],
      unknowns: [item("ROLE_PREFERENCE_UNKNOWN", "UNKNOWN", "PREFERENCE")],
    });
    expect(groups.gaps.map((entry) => entry.code)).toEqual(["EXPERIENCE"]);
    expect(groups.preferences.map((entry) => entry.code)).toEqual([
      "REMOTE_PREFERENCE",
      "ROLE_PREFERENCE_UNKNOWN",
    ]);
  });

  it("derives precise profile links from actual unknown evidence", () => {
    const guidance = buildAssessmentGuidance([
      item("REQUIRED_SKILL_typescript", "UNKNOWN"),
      item("EDUCATION_UNKNOWN", "UNKNOWN"),
      item("REQUIRED_SKILL_react", "UNKNOWN"),
    ]);
    expect(guidance).toEqual([
      expect.objectContaining({ href: "/profile#skills" }),
      expect.objectContaining({ href: "/profile#education" }),
    ]);
  });
});
