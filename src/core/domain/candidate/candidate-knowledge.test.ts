import { describe, expect, it } from "vitest";
import {
  buildCandidateKnowledgeCoverage,
  candidateKnowledgeGapPrompts,
  candidateKnowledgePolicy,
  employerSpecificConsentFromGeneralPreference,
  isCandidateKnowledgeConcept,
  resolveCandidateKnowledge,
  type CandidateKnowledgeEvidence,
} from "./candidate-knowledge";
import { evidenceFromCandidateSources } from "@/features/candidate/candidate-knowledge-evidence";

const now = new Date("2026-09-12T12:00:00.000Z");

function item(
  overrides: Partial<CandidateKnowledgeEvidence> = {},
): CandidateKnowledgeEvidence {
  return {
    concept: "CURRENT_LOCATION",
    value: { text: "São Paulo, SP" },
    origin: "EXPLICIT",
    source: "RESUME",
    sourceId: "fact-1",
    autoAnswerAllowed: true,
    candidateApproved: true,
    reusable: true,
    confirmedAt: now,
    ...overrides,
  };
}

function emptySources() {
  return {
    profile: null,
    experiences: [],
    education: [],
    skills: [],
    projects: [],
    credentials: [],
    verifiedResumeFacts: [],
    preferences: null,
    authorization: null,
    memories: [],
  };
}

describe("candidate knowledge coverage", () => {
  it("allows explicit and faithful derived evidence to satisfy coverage", () => {
    expect(
      resolveCandidateKnowledge({
        concept: "CURRENT_LOCATION",
        evidence: [item()],
        now,
      }).status,
    ).toBe("AVAILABLE");
    const derived = resolveCandidateKnowledge({
      concept: "APPLICATION_EMAIL",
      evidence: [
        item({
          concept: "APPLICATION_EMAIL",
          value: { text: "candidate@example.test" },
          origin: "DERIVED",
        }),
      ],
      now,
    });
    expect(derived.status).toBe("AVAILABLE");
    expect(derived.origin).toBe("DERIVED");
  });

  it("normalizes an accepted résumé email with derived provenance", () => {
    const evidence = evidenceFromCandidateSources({
      ...emptySources(),
      verifiedResumeFacts: [
        {
          id: "email-1",
          factType: "PROFILE_EMAIL",
          value: { text: " Candidate@Example.Test " },
          updatedAt: now,
        },
      ],
    });
    expect(
      resolveCandidateKnowledge({
        concept: "APPLICATION_EMAIL",
        evidence,
        now,
      }),
    ).toMatchObject({
      status: "AVAILABLE",
      origin: "DERIVED",
      value: { text: "candidate@example.test" },
      provenance: { source: "RESUME", sourceId: "email-1" },
    });
  });

  it("never promotes unsupported inference into known coverage", () => {
    expect(
      resolveCandidateKnowledge({
        concept: "US_WORK_AUTHORIZATION",
        evidence: [
          item({ concept: "US_WORK_AUTHORIZATION", origin: "INFERRED" }),
        ],
        now,
      }).status,
    ).toBe("MISSING");
  });

  it("does not globalize employer-specific answers", () => {
    expect(isCandidateKnowledgeConcept("WHY_COMPANY_X")).toBe(false);
    expect(isCandidateKnowledgeConcept("EMPLOYER_PRIVACY_CONSENT")).toBe(false);
  });

  it("does not infer English fluency from the language of a résumé", () => {
    const evidence = evidenceFromCandidateSources(emptySources());
    expect(
      resolveCandidateKnowledge({
        concept: "LANGUAGE_PROFICIENCY:english",
        evidence,
        now,
      }).status,
    ).toBe("MISSING");
  });

  it("distinguishes an explicit language name from explicit proficiency", () => {
    const base = emptySources();
    const languageOnly = evidenceFromCandidateSources({
      ...base,
      verifiedResumeFacts: [
        {
          id: "language-1",
          factType: "LANGUAGE_TEXT",
          value: { text: "English" },
          updatedAt: now,
        },
      ],
    });
    const coverage = buildCandidateKnowledgeCoverage({
      evidence: languageOnly,
      concepts: ["LANGUAGE:english"],
      now,
    });
    expect(
      coverage.find((entry) => entry.concept === "LANGUAGE:english")?.status,
    ).toBe("KNOWN");
    expect(
      coverage.find((entry) => entry.concept === "LANGUAGE_PROFICIENCY:english")
        ?.status,
    ).toBe("PARTIAL");

    const withLevel = evidenceFromCandidateSources({
      ...base,
      verifiedResumeFacts: [
        {
          id: "language-2",
          factType: "LANGUAGE_TEXT",
          value: { text: "Portuguese — Native" },
          updatedAt: now,
        },
      ],
    });
    expect(
      resolveCandidateKnowledge({
        concept: "LANGUAGE_PROFICIENCY:portuguese",
        evidence: withLevel,
        now,
      }).status,
    ).toBe("AVAILABLE");
  });

  it("prefers a current candidate answer and surfaces conflict with older résumé evidence", () => {
    const result = resolveCandidateKnowledge({
      concept: "CURRENT_LOCATION",
      evidence: [
        item({
          confirmedAt: new Date("2025-01-01T00:00:00Z"),
          value: { text: "Rio de Janeiro" },
        }),
        item({
          source: "ANSWER_MEMORY",
          sourceId: "memory-1",
          confirmedAt: now,
          value: { text: "São Paulo" },
        }),
      ],
      now,
    });
    expect(result.value).toEqual({ text: "São Paulo" });
    expect(result.provenance?.source).toBe("ANSWER_MEMORY");
    expect(result.conflict).toBe(true);
    expect(result.conflictingEvidence).toEqual([
      expect.objectContaining({
        provenance: { source: "RESUME", sourceId: "fact-1" },
        value: { text: "Rio de Janeiro" },
      }),
    ]);
  });

  it("generates targeted prompts only for uncovered recurring concepts", () => {
    const coverage = buildCandidateKnowledgeCoverage({
      evidence: [
        item({
          concept: "TARGET_ROLE",
          value: { text: "Security engineer" },
          source: "CANDIDATE_DIRECT",
        }),
      ],
      concepts: [
        "TARGET_ROLE",
        "NOTICE_PERIOD",
        "AI_HIRING_PROCESS_PREFERENCE",
      ],
      now,
    });
    const prompts = candidateKnowledgeGapPrompts(coverage);
    expect(prompts.flatMap((prompt) => prompt.concepts)).not.toContain(
      "TARGET_ROLE",
    );
    expect(prompts.flatMap((prompt) => prompt.concepts)).toContain(
      "NOTICE_PERIOD",
    );
    expect(prompts.flatMap((prompt) => prompt.concepts)).toContain(
      "AI_HIRING_PROCESS_PREFERENCE",
    );
  });

  it("supports manual completion without any résumé evidence", () => {
    const manual = item({
      concept: "NOTICE_PERIOD",
      source: "CANDIDATE_DIRECT",
      value: { text: "30 days" },
    });
    expect(
      resolveCandidateKnowledge({
        concept: "NOTICE_PERIOD",
        evidence: [manual],
        now,
      }).status,
    ).toBe("AVAILABLE");
  });

  it("surfaces a safe approved AnswerMemory through the same resolver", () => {
    const evidence = evidenceFromCandidateSources({
      ...emptySources(),
      memories: [
        {
          id: "memory-1",
          concept: "NOTICE_PERIOD",
          answer: { text: "30 days" },
          autoAnswerAllowed: true,
          origin: "EXPLICIT",
          candidateApproved: true,
          reusable: true,
          verifiedAt: now,
        },
      ],
    });
    expect(
      resolveCandidateKnowledge({ concept: "NOTICE_PERIOD", evidence, now }),
    ).toMatchObject({
      status: "AVAILABLE",
      value: { text: "30 days" },
      provenance: { source: "ANSWER_MEMORY", sourceId: "memory-1" },
      candidateApproved: true,
    });
  });

  it("faithfully derives current employment only from an explicit current experience", () => {
    const evidence = evidenceFromCandidateSources({
      ...emptySources(),
      experiences: [
        {
          id: "experience-1",
          updatedAt: now,
          isCurrent: true,
          employer: "Example Labs",
        },
      ],
    });
    const result = resolveCandidateKnowledge({
      concept: "CURRENT_EMPLOYMENT_STATUS",
      evidence,
      now,
    });
    expect(result).toMatchObject({
      status: "AVAILABLE",
      origin: "DERIVED",
      value: { status: "EMPLOYED" },
    });
  });

  it("makes current compensation optional and never infers it", () => {
    expect(
      candidateKnowledgePolicy("CURRENT_COMPENSATION")?.candidateInputOptional,
    ).toBe(true);
    expect(
      resolveCandidateKnowledge({
        concept: "CURRENT_COMPENSATION",
        evidence: [],
        now,
      }).status,
    ).toBe("MISSING");
  });

  it("requires confirmation for stale volatile values but never expires stable history", () => {
    const old = new Date("2020-01-01T00:00:00Z");
    expect(
      resolveCandidateKnowledge({
        concept: "CURRENT_COMPENSATION",
        evidence: [
          item({
            concept: "CURRENT_COMPENSATION",
            source: "CANDIDATE_DIRECT",
            confirmedAt: old,
            value: { amount: 10000, currency: "BRL", period: "monthly" },
          }),
        ],
        now,
      }),
    ).toMatchObject({
      status: "STALE_CONFIRMATION_REQUIRED",
      freshness: "STALE",
      confirmedAt: old,
    });
    expect(
      resolveCandidateKnowledge({
        concept: "EMPLOYMENT_HISTORY",
        evidence: [item({ concept: "EMPLOYMENT_HISTORY", confirmedAt: old })],
        now,
      }).status,
    ).toBe("AVAILABLE");
  });

  it("never converts general privacy or AI preferences into employer consent", () => {
    expect(
      candidateKnowledgePolicy("GENERAL_DATA_USE_PREFERENCE")
        ?.reusableForEmployerQuestions,
    ).toBe(false);
    expect(
      candidateKnowledgePolicy("AI_HIRING_PROCESS_PREFERENCE")
        ?.reusableForEmployerQuestions,
    ).toBe(false);
    expect(employerSpecificConsentFromGeneralPreference()).toBe(false);
    expect(
      resolveCandidateKnowledge({
        concept: "GENERAL_DATA_USE_PREFERENCE",
        evidence: [
          item({
            concept: "GENERAL_DATA_USE_PREFERENCE",
            source: "CANDIDATE_DIRECT",
          }),
        ],
        now,
      }),
    ).toMatchObject({
      applicationUse: "PREFERENCE_CONTEXT_ONLY",
      autoAnswerAllowed: false,
    });
  });
});
