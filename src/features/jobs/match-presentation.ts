import type { MatchEvidence } from "@/core/domain/matching/match-job";

export interface AssessmentGuidance {
  readonly code: string;
  readonly href: string | null;
  readonly label: string;
}

const GUIDANCE: readonly {
  readonly pattern: RegExp;
  readonly href: string | null;
  readonly label: string;
}[] = [
  {
    pattern: /AUTHORIZATION|SPONSORSHIP/u,
    href: "/profile#authorization",
    label: "Clarify work authorization and sponsorship needs.",
  },
  {
    pattern: /SKILL|CLEARANCE|LANGUAGE|LICENSE/u,
    href: "/profile#skills",
    label: "Add verified skills, tools, credentials, or language evidence.",
  },
  {
    pattern: /PREFERENCE/u,
    href: "/profile#preferences",
    label: "Clarify the job preferences that matter to you.",
  },
  {
    pattern: /EXPERIENCE|SENIORITY|ROLE_FAMILY/u,
    href: "/profile#experience",
    label: "Add relevant experience and dates.",
  },
  {
    pattern: /EDUCATION/u,
    href: "/profile#education",
    label: "Add education or credential details.",
  },
  {
    pattern: /COMPENSATION/u,
    href: null,
    label: "Check the employer posting for compensation details.",
  },
];

export function splitMatchEvidence(groups: {
  readonly conflicts: readonly MatchEvidence[];
  readonly gaps: readonly MatchEvidence[];
  readonly partials: readonly MatchEvidence[];
  readonly strengths: readonly MatchEvidence[];
  readonly unknowns: readonly MatchEvidence[];
}) {
  const preferences = [
    ...groups.conflicts,
    ...groups.strengths,
    ...groups.partials,
    ...groups.gaps,
    ...groups.unknowns,
  ].filter((item) => item.category === "PREFERENCE");
  return {
    conflicts: groups.conflicts.filter(
      (item) => item.category !== "PREFERENCE",
    ),
    gaps: groups.gaps.filter((item) => item.category !== "PREFERENCE"),
    partials: groups.partials.filter((item) => item.category !== "PREFERENCE"),
    preferences,
    strengths: groups.strengths.filter(
      (item) => item.category !== "PREFERENCE",
    ),
    unknowns: groups.unknowns.filter((item) => item.category !== "PREFERENCE"),
  };
}

export function buildAssessmentGuidance(
  unknowns: readonly MatchEvidence[],
): AssessmentGuidance[] {
  const seen = new Set<string>();
  const result: AssessmentGuidance[] = [];
  for (const unknown of unknowns) {
    const guidance = GUIDANCE.find((item) => item.pattern.test(unknown.code));
    if (!guidance || seen.has(guidance.label)) continue;
    seen.add(guidance.label);
    result.push({ code: unknown.code, ...guidance });
  }
  return result;
}
