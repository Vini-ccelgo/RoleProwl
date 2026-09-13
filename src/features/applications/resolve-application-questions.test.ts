import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/core/contracts/ai-provider";
import type {
  CandidateKnowledgeConcept,
  CandidateKnowledgeQueryResult,
} from "@/core/domain/candidate/candidate-knowledge";
import {
  applicationJurisdictionCountryCode,
  mapApplicationQuestionToCandidateConcept,
  resolveApplicationQuestions,
  type ResolvableApplicationQuestion,
} from "./resolve-application-questions";

function question(
  label: string,
  overrides: Partial<ResolvableApplicationQuestion> = {},
): ResolvableApplicationQuestion {
  return {
    id: `question:${label}`,
    source: "GREENHOUSE",
    group: "STANDARD",
    label,
    required: true,
    fieldNames: [label],
    fieldTypes: ["input_text"],
    options: [],
    controlDisposition: "ROLEPROWL_RESOLVED",
    ...overrides,
  };
}

function knowledge(
  concept: CandidateKnowledgeConcept,
  value: Readonly<Record<string, unknown>>,
  overrides: Partial<CandidateKnowledgeQueryResult> = {},
): CandidateKnowledgeQueryResult {
  return {
    concept,
    applicationUse: "REUSABLE_ANSWER",
    autoAnswerAllowed: true,
    candidateApproved: true,
    conflict: false,
    conflictingEvidence: [],
    confirmedAt: new Date("2026-09-13T00:00:00Z"),
    freshness: "CURRENT",
    origin: "EXPLICIT",
    provenance: { source: "ANSWER_MEMORY", sourceId: "memory-1" },
    reusable: true,
    status: "AVAILABLE",
    value,
    ...overrides,
  };
}

function fakeAI(resolutions: unknown[]) {
  const generateStructured = vi.fn(async () => ({
    data: { resolutions },
    metadata: {},
  }));
  return {
    ai: { generateStructured } as unknown as AIProvider,
    generateStructured,
  };
}

describe("application question resolver", () => {
  it.each([
    "English proficiency",
    "Qual o seu nível de fluência na língua inglesa?",
    "How comfortable are you working professionally in English?",
  ])("maps English proficiency variant: %s", (label) => {
    expect(mapApplicationQuestionToCandidateConcept(question(label))).toBe(
      "LANGUAGE_PROFICIENCY:english",
    );
  });

  it("honors an explicit later candidate resolution of older conflicting evidence", async () => {
    const [result] = await resolveApplicationQuestions({
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [question("English proficiency")],
      knowledge: [
        knowledge(
          "LANGUAGE_PROFICIENCY:english",
          {
            proficiency: "Professional fluent",
            _candidateConflictResolvedAt: "2026-09-13T00:00:00.000Z",
          },
          {
            conflict: true,
            conflictingEvidence: [
              {
                confirmedAt: new Date("2026-09-01T00:00:00Z"),
                origin: "EXPLICIT",
                provenance: { source: "RESUME", sourceId: "fact-1" },
                value: { proficiency: "Intermediate" },
              },
            ],
          },
        ),
      ],
    });
    expect(result.disposition).toBe("AUTO_RESOLVED");
  });

  it.each([
    "Will you now or in the future require visa sponsorship?",
    "Do you require sponsorship?",
    "Precisará de patrocínio de visto?",
  ])("requires jurisdiction for a generic sponsorship variant: %s", (label) => {
    expect(
      mapApplicationQuestionToCandidateConcept(question(label)),
    ).toBeNull();
  });

  it("distinguishes an explicit language from its proficiency", () => {
    expect(
      mapApplicationQuestionToCandidateConcept(
        question("Do you speak Portuguese?"),
      ),
    ).toBe("LANGUAGE:portuguese");
  });

  it("resolves approved current reusable knowledge without AI", async () => {
    const fake = fakeAI([]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [question("English proficiency")],
      knowledge: [
        knowledge("LANGUAGE_PROFICIENCY:english", {
          proficiency: "Professional fluent",
        }),
      ],
    });
    expect(result).toMatchObject({
      canonicalConcept: "LANGUAGE_PROFICIENCY:english",
      disposition: "AUTO_RESOLVED",
      value: "Professional fluent",
    });
    expect(fake.generateStructured).not.toHaveBeenCalled();
  });

  it("faithfully adapts explicit authorization and sponsorship booleans", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [
        question("Are you authorized to work in the United States?", {
          fieldTypes: ["input_radio"],
          options: ["Yes", "No"],
        }),
        question("Do you require sponsorship?", {
          fieldTypes: ["input_radio"],
          options: ["Yes", "No"],
        }),
      ],
      knowledge: [
        knowledge("US_WORK_AUTHORIZATION", { status: "Citizen" }),
        knowledge("US_FUTURE_SPONSORSHIP", { required: false }),
      ],
      jurisdictionContext: { jobLocations: ["New York, NY"] },
    });
    expect(results.map((result) => result.value)).toEqual(["Yes", "No"]);
    expect(
      results.every((result) => result.disposition === "AUTO_RESOLVED"),
    ).toBe(true);
  });

  it.each([
    ["Are you legally authorized to work in Brazil?", "WORK_AUTHORIZATION:BR"],
    [
      "Você possui autorização para trabalhar no Brasil?",
      "WORK_AUTHORIZATION:BR",
    ],
    [
      "Are you legally authorized to work in the United States?",
      "WORK_AUTHORIZATION:US",
    ],
    ["Will you require sponsorship in Brazil?", "SPONSORSHIP_REQUIREMENT:BR"],
    [
      "Precisará de patrocínio de visto no Brasil?",
      "SPONSORSHIP_REQUIREMENT:BR",
    ],
    [
      "Will you require sponsorship in the United States?",
      "SPONSORSHIP_REQUIREMENT:US",
    ],
  ] as const)("maps explicit jurisdiction wording: %s", (label, concept) => {
    expect(mapApplicationQuestionToCandidateConcept(question(label))).toBe(
      concept,
    );
  });

  it("resolves generic questions only from a single-country job context", () => {
    const brazil = {
      jobLocations: [
        "Belo Horizonte, MG",
        "Curitiba, PR",
        "Recife, PE",
        "São Paulo, SP",
      ],
    };
    expect(
      mapApplicationQuestionToCandidateConcept(
        question(
          "Are you legally authorized to work in the country where this role is located?",
        ),
        brazil,
      ),
    ).toBe("WORK_AUTHORIZATION:BR");
    expect(
      mapApplicationQuestionToCandidateConcept(
        question("Do you require sponsorship?"),
        brazil,
      ),
    ).toBe("SPONSORSHIP_REQUIREMENT:BR");
    expect(
      applicationJurisdictionCountryCode({
        question: question("Do you require sponsorship?"),
        context: brazil,
      }),
    ).toBe("BR");
  });

  it("gives explicit employer wording authority over a different job-location context", () => {
    expect(
      mapApplicationQuestionToCandidateConcept(
        question("Are you authorized to work in the United States?"),
        { jobLocations: ["São Paulo, SP"] },
      ),
    ).toBe("WORK_AUTHORIZATION:US");
    expect(
      mapApplicationQuestionToCandidateConcept(
        question("Are you authorized to work in Brazil or the United States?"),
        { jobLocations: ["São Paulo, SP"] },
      ),
    ).toBeNull();
  });

  it.each([
    [["São Paulo, SP", "New York, NY"]],
    [["Remote", "São Paulo, SP"]],
    [null],
  ])(
    "keeps generic wording candidate-required for ambiguous context: %s",
    async (jobLocations) => {
      const [result] = await resolveApplicationQuestions({
        correlationId: "application-ambiguous",
        userId: "candidate-1",
        questions: [question("Do you require sponsorship?")],
        knowledge: [knowledge("US_FUTURE_SPONSORSHIP", { required: false })],
        jurisdictionContext: { jobLocations },
      });
      expect(result).toMatchObject({
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        reasonCode: "AUTHORIZATION_JURISDICTION_REQUIRED",
        value: null,
      });
    },
  );

  it.each(["PROFILE", "RESUME"] as const)(
    "never uses %s location or biography to infer authorization jurisdiction",
    async (source) => {
      const [result] = await resolveApplicationQuestions({
        correlationId: "application-no-job-country",
        userId: "candidate-1",
        questions: [question("Are you authorized to work?")],
        knowledge: [
          knowledge(
            "CURRENT_LOCATION",
            { text: "São Paulo, Brazil" },
            { provenance: { source, sourceId: "location-1" } },
          ),
          knowledge("REUSABLE_SELF_DESCRIPTION", {
            text: "Brazilian citizen and resident",
          }),
          knowledge("WORK_AUTHORIZATION:BR", { status: "Authorized" }),
        ],
      });
      expect(result).toMatchObject({
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        reasonCode: "AUTHORIZATION_JURISDICTION_REQUIRED",
      });
    },
  );

  it("keeps authorization and sponsorship values isolated across Brazil and US", async () => {
    const questions = [
      question("Are you authorized to work in Brazil?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
      }),
      question("Will you require sponsorship in Brazil?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
      }),
      question("Are you authorized to work in the United States?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
      }),
      question("Will you require sponsorship in the United States?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
      }),
    ];
    const brazilOnly = await resolveApplicationQuestions({
      correlationId: "application-br",
      userId: "candidate-1",
      questions,
      knowledge: [
        knowledge("WORK_AUTHORIZATION:BR", { status: "Authorized" }),
        knowledge("SPONSORSHIP_REQUIREMENT:BR", { required: false }),
      ],
    });
    expect(brazilOnly.map((result) => result.disposition)).toEqual([
      "AUTO_RESOLVED",
      "AUTO_RESOLVED",
      "CANDIDATE_REQUIRED",
      "CANDIDATE_REQUIRED",
    ]);
    const legacyUsOnly = await resolveApplicationQuestions({
      correlationId: "application-us",
      userId: "candidate-1",
      questions,
      knowledge: [
        knowledge("US_WORK_AUTHORIZATION", { status: "Citizen" }),
        knowledge("US_FUTURE_SPONSORSHIP", { required: false }),
      ],
    });
    expect(legacyUsOnly.map((result) => result.disposition)).toEqual([
      "CANDIDATE_REQUIRED",
      "CANDIDATE_REQUIRED",
      "AUTO_RESOLVED",
      "AUTO_RESOLVED",
    ]);
    expect(
      legacyUsOnly.slice(2).map((result) => result.canonicalConcept),
    ).toEqual(["WORK_AUTHORIZATION:US", "SPONSORSHIP_REQUIREMENT:US"]);
  });

  it("proves the Inter Brazil fixture cannot consume legacy US sponsorship", async () => {
    const [result] = await resolveApplicationQuestions({
      correlationId: "cmtz3cnz0003p04jk97po0v0b",
      userId: "candidate-1",
      questions: [
        question("Precisará de patrocínio de visto?", {
          fieldTypes: ["input_radio"],
          options: ["Sim", "Não"],
        }),
      ],
      knowledge: [knowledge("US_FUTURE_SPONSORSHIP", { required: false })],
      jurisdictionContext: {
        jobLocations: [
          "Belo Horizonte, MG",
          "Curitiba, PR",
          "Recife, PE",
          "São Paulo, SP",
        ],
      },
    });
    expect(result).toMatchObject({
      canonicalConcept: "SPONSORSHIP_REQUIREMENT:BR",
      disposition: "CANDIDATE_REQUIRED",
      reasonCode: "CANDIDATE_KNOWLEDGE_MISSING",
    });
    expect(result.candidateKnowledgeReferences).toEqual([]);
  });

  it.each([
    ["auto disabled", { autoAnswerAllowed: false }, "PROPOSED_FOR_CANDIDATE"],
    [
      "preference only",
      { applicationUse: "PREFERENCE_CONTEXT_ONLY" as const },
      "PROPOSED_FOR_CANDIDATE",
    ],
    [
      "stale",
      {
        status: "STALE_CONFIRMATION_REQUIRED" as const,
        freshness: "STALE" as const,
      },
      "CANDIDATE_REQUIRED",
    ],
    [
      "conflict",
      {
        conflict: true,
        conflictingEvidence: [
          {
            confirmedAt: new Date("2025-01-01T00:00:00Z"),
            origin: "EXPLICIT" as const,
            provenance: { source: "RESUME" as const, sourceId: "fact-1" },
            value: { proficiency: "Intermediate" },
          },
        ],
      },
      "CANDIDATE_REQUIRED",
    ],
  ])(
    "does not auto-resolve %s knowledge",
    async (_label, overrides, disposition) => {
      const [result] = await resolveApplicationQuestions({
        correlationId: "application-1",
        userId: "candidate-1",
        questions: [question("English proficiency")],
        knowledge: [
          knowledge(
            "LANGUAGE_PROFICIENCY:english",
            { proficiency: "Professional fluent" },
            overrides,
          ),
        ],
      });
      expect(result.disposition).toBe(disposition);
    },
  );

  it("requires approval when adapting to a broader employer taxonomy", async () => {
    const [result] = await resolveApplicationQuestions({
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [
        question("English proficiency", {
          fieldTypes: ["multi_value_single_select"],
          options: ["Beginner", "Intermediate", "Advanced", "Fluent / Native"],
        }),
      ],
      knowledge: [
        knowledge("LANGUAGE_PROFICIENCY:english", {
          proficiency: "Professional fluent",
        }),
      ],
    });
    expect(result).toMatchObject({
      disposition: "PROPOSED_FOR_CANDIDATE",
      value: "Fluent / Native",
    });
  });

  it("keeps employer-specific and unknown consequential questions candidate-controlled", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [
        question("Why do you want to work at Inter?"),
        question("Please provide your security clearance details"),
      ],
      knowledge: [],
    });
    expect(results.map((result) => result.reasonCode)).toEqual([
      "EMPLOYER_SPECIFIC_ANSWER",
      "UNKNOWN_CONSEQUENTIAL_QUESTION",
    ]);
    expect(
      results.every((result) => result.disposition === "CANDIDATE_REQUIRED"),
    ).toBe(true);
  });

  it("keeps consent, files, and unsupported widgets outside automatic resolution", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "application-1",
      userId: "candidate-1",
      knowledge: [
        knowledge(
          "AI_HIRING_PROCESS_PREFERENCE",
          { text: "Prefer no AI interview transcription" },
          {
            applicationUse: "PREFERENCE_CONTEXT_ONLY",
            autoAnswerAllowed: false,
          },
        ),
      ],
      questions: [
        question("AI interview consent", {
          controlDisposition: "CANDIDATE_REQUIRED_EXTERNAL",
        }),
        question("Upload résumé", {
          fieldTypes: ["input_file"],
          controlDisposition: "CANDIDATE_REQUIRED_EXTERNAL",
        }),
        question("Dynamic widget", { controlDisposition: "UNSUPPORTED" }),
      ],
    });
    expect(results.map((result) => result.disposition)).toEqual([
      "HUMAN_REQUIRED",
      "HUMAN_REQUIRED",
      "UNSUPPORTED",
    ]);
  });

  it("uses one bounded AI call and accepts only grounded mappings to supplied concepts", async () => {
    const first = question("Describe how you communicate technical findings");
    const second = question("How do you explain complex issues?");
    const reference = "REUSABLE_SELF_DESCRIPTION:ANSWER_MEMORY:memory-1";
    const fake = fakeAI([
      {
        questionId: first.id,
        canonicalConcept: "REUSABLE_SELF_DESCRIPTION",
        proposedValue: "I communicate technical findings to engineering teams.",
        candidateKnowledgeReferences: [reference],
        confidence: 0.9,
      },
      {
        questionId: second.id,
        canonicalConcept: "NOT_IN_REGISTRY",
        proposedValue: "I brief clients and boards.",
        candidateKnowledgeReferences: [reference],
        confidence: 0.9,
      },
    ]);
    const results = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [first, second],
      knowledge: [
        knowledge("REUSABLE_SELF_DESCRIPTION", {
          text: "Presented technical findings to engineering teams.",
        }),
        knowledge("CURRENT_COMPENSATION", {
          amount: 10_000,
          currency: "BRL",
          period: "monthly",
        }),
        knowledge("APPLICATION_EMAIL", { text: "private@example.test" }),
        knowledge("WORK_AUTHORIZATION:BR", { status: "Authorized" }),
        knowledge("US_FUTURE_SPONSORSHIP", { required: false }),
      ],
    });
    expect(fake.generateStructured).toHaveBeenCalledOnce();
    const aiInput = JSON.stringify(fake.generateStructured.mock.calls[0]);
    expect(aiInput).not.toContain("10000");
    expect(aiInput).not.toContain("private@example.test");
    expect(aiInput).not.toContain("WORK_AUTHORIZATION:BR");
    expect(aiInput).not.toContain("US_FUTURE_SPONSORSHIP");
    expect(results[0]).toMatchObject({
      disposition: "PROPOSED_FOR_CANDIDATE",
      reasonCode: "AI_GROUNDED_REFRAME_APPROVAL_REQUIRED",
    });
    expect(results[1]).toMatchObject({
      disposition: "CANDIDATE_REQUIRED",
      value: null,
    });
  });

  it.each([
    "native speaker",
    "C2 bilingual",
    "presented to clients and the board",
  ])("rejects an unsupported AI upgrade: %s", async (proposedValue) => {
    const candidateQuestion = question("How do you communicate in English?");
    const reference = "REUSABLE_SELF_DESCRIPTION:ANSWER_MEMORY:memory-1";
    const fake = fakeAI([
      {
        questionId: candidateQuestion.id,
        canonicalConcept: "REUSABLE_SELF_DESCRIPTION",
        proposedValue,
        candidateKnowledgeReferences: [reference],
        confidence: 0.9,
      },
    ]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [candidateQuestion],
      knowledge: [
        knowledge("REUSABLE_SELF_DESCRIPTION", {
          text: "I work professionally in English with engineering teams.",
        }),
      ],
    });
    expect(result.disposition).toBe("CANDIDATE_REQUIRED");
  });

  it("falls back to candidate-required when AI times out", async () => {
    const generateStructured = vi.fn(async () => {
      throw new Error("timeout");
    });
    const [result] = await resolveApplicationQuestions({
      ai: { generateStructured } as unknown as AIProvider,
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [question("Tell us about communicating findings")],
      knowledge: [
        knowledge("REUSABLE_SELF_DESCRIPTION", { text: "Technical writing" }),
      ],
    });
    expect(generateStructured).toHaveBeenCalledOnce();
    expect(result.disposition).toBe("CANDIDATE_REQUIRED");
  });

  it("reduces a six-question deterministic fixture to one candidate answer", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [
        question("First name"),
        question("Email"),
        question("English proficiency"),
        question("Do you require sponsorship?", {
          fieldTypes: ["input_radio"],
          options: ["Yes", "No"],
        }),
        question("What is your notice period?"),
        question("Why do you want to work at Inter?"),
      ],
      knowledge: [
        knowledge("FIRST_NAME", { text: "Avery" }),
        knowledge("APPLICATION_EMAIL", { text: "avery@example.test" }),
        knowledge("LANGUAGE_PROFICIENCY:english", {
          proficiency: "Professional fluent",
        }),
        knowledge("US_FUTURE_SPONSORSHIP", { required: false }),
        knowledge("NOTICE_PERIOD", { text: "30 days" }),
      ],
      jurisdictionContext: {
        jobLocations: [
          "Belo Horizonte, MG",
          "Curitiba, PR",
          "Recife, PE",
          "São Paulo, SP",
        ],
      },
    });
    expect(
      results.filter((result) => result.disposition === "AUTO_RESOLVED"),
    ).toHaveLength(4);
    expect(
      results.filter((result) => result.disposition === "CANDIDATE_REQUIRED"),
    ).toHaveLength(2);
  });
});
