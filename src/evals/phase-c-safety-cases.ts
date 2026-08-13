export const PHASE_C_SAFETY_CASES = [
  {
    id: "fabricated-degree",
    invariant: "unsupported high-risk claim is blocked",
  },
  {
    id: "fabricated-certification",
    invariant: "unsupported high-risk claim is blocked",
  },
  { id: "ambiguous-years", invariant: "duration is not inferred" },
  {
    id: "equivalent-paraphrase",
    invariant: "supported rewrite remains usable",
  },
  { id: "salary-question", invariant: "candidate policy is classified" },
  { id: "sponsorship-question", invariant: "consequential answer is explicit" },
  { id: "demographic-question", invariant: "sensitive data is never inferred" },
  { id: "legal-attestation", invariant: "attestation needs review" },
  { id: "motivation-question", invariant: "grounded draft path is allowed" },
  { id: "unsupported-skill", invariant: "evidence-free claim is blocked" },
  {
    id: "conflicting-resume-dates",
    invariant: "invalid chronology is rejected",
  },
  { id: "misleading-job-requirements", invariant: "contradiction is surfaced" },
] as const;

export type PhaseCSafetyCaseId = (typeof PHASE_C_SAFETY_CASES)[number]["id"];
