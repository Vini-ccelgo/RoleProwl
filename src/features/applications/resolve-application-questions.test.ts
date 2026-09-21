import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/core/contracts/ai-provider";
import {
  AIDataPolicyError,
  AIInvalidOutputError,
} from "@/core/errors/application-errors";
import type { Logger } from "@/lib/logging/logger";
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

function safeLog() {
  return { log: vi.fn() } as unknown as Logger & {
    log: ReturnType<typeof vi.fn>;
  };
}

describe("application question resolver", () => {
  it.each([
    ["FIRST_NAME", "First name", { text: "Maya" }],
    ["LAST_NAME", "Last name", { text: "Chen" }],
    ["APPLICATION_EMAIL", "Email", { text: "maya@example.test" }],
    ["PHONE", "Phone", { text: "+1 555 0142" }],
    ["LINKEDIN_URL", "LinkedIn profile", { text: "linkedin.com/in/maya" }],
    ["WEBSITE_URL", "Portfolio website", { text: "maya.example.test" }],
  ] as const)(
    "auto-uses candidate-approved stable %s knowledge",
    async (concept, label, value) => {
      const [result] = await resolveApplicationQuestions({
        correlationId: "application-stable-profile",
        userId: "candidate-1",
        questions: [question(label)],
        knowledge: [
          knowledge(concept, value, {
            freshness: "NOT_APPLICABLE",
            provenance: { source: "CANDIDATE_DIRECT", sourceId: "profile-1" },
          }),
        ],
      });
      expect(result).toMatchObject({
        canonicalConcept: concept,
        disposition: "AUTO_RESOLVED",
        reasonCode: "APPROVED_REUSABLE_KNOWLEDGE",
      });
    },
  );

  it("auto-uses an accepted résumé phone but not unapproved résumé evidence", async () => {
    const accepted = knowledge(
      "PHONE",
      { text: "+55 11 99999-0000" },
      {
        freshness: "NOT_APPLICABLE",
        origin: "DERIVED",
        provenance: { source: "RESUME", sourceId: "accepted-phone" },
      },
    );
    const [approved, unapproved] = await Promise.all([
      resolveApplicationQuestions({
        correlationId: "accepted-resume-phone",
        userId: "candidate-1",
        questions: [question("Phone")],
        knowledge: [accepted],
      }),
      resolveApplicationQuestions({
        correlationId: "unapproved-resume-phone",
        userId: "candidate-1",
        questions: [question("Phone")],
        knowledge: [{ ...accepted, candidateApproved: false }],
      }),
    ]);
    expect(approved[0]?.disposition).toBe("AUTO_RESOLVED");
    expect(unapproved[0]?.disposition).toBe("PROPOSED_FOR_CANDIDATE");
  });

  it("does not use a pending narrative proposal absent from approved knowledge", async () => {
    const [result] = await resolveApplicationQuestions({
      correlationId: "pending-narrative",
      userId: "candidate-1",
      questions: [question("What is your notice period?")],
      knowledge: [],
    });
    expect(result).toMatchObject({
      disposition: "CANDIDATE_REQUIRED",
      reasonCode: "CANDIDATE_KNOWLEDGE_MISSING",
    });
  });

  it("auto-uses an approved narrative-derived notice period until it is stale", async () => {
    const approved = knowledge(
      "NOTICE_PERIOD",
      { text: "30 days" },
      {
        origin: "DERIVED",
        provenance: { source: "ANSWER_MEMORY", sourceId: "approved-1" },
      },
    );
    const [current, stale] = await Promise.all([
      resolveApplicationQuestions({
        correlationId: "approved-narrative",
        userId: "candidate-1",
        questions: [question("What is your notice period?")],
        knowledge: [approved],
      }),
      resolveApplicationQuestions({
        correlationId: "stale-approved-narrative",
        userId: "candidate-1",
        questions: [question("What is your notice period?")],
        knowledge: [
          {
            ...approved,
            status: "STALE_CONFIRMATION_REQUIRED",
            freshness: "STALE",
          },
        ],
      }),
    ]);
    expect(current[0]).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "30 days",
    });
    expect(stale[0]).toMatchObject({
      disposition: "CANDIDATE_REQUIRED",
      reasonCode: "CANDIDATE_KNOWLEDGE_STALE",
    });
  });

  it("auto-uses current explicit compensation but requires stale compensation confirmation", async () => {
    const current = knowledge("CURRENT_COMPENSATION", {
      amount: 10_000,
      currency: "BRL",
      period: "monthly",
    });
    const results = await Promise.all([
      resolveApplicationQuestions({
        correlationId: "current-compensation",
        userId: "candidate-1",
        questions: [question("Current compensation")],
        knowledge: [current],
      }),
      resolveApplicationQuestions({
        correlationId: "stale-compensation",
        userId: "candidate-1",
        questions: [question("Current compensation")],
        knowledge: [
          {
            ...current,
            status: "STALE_CONFIRMATION_REQUIRED",
            freshness: "STALE",
          },
        ],
      }),
    ]);
    expect(results[0]?.[0]).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "BRL 10000 monthly",
    });
    expect(results[1]?.[0]).toMatchObject({
      disposition: "CANDIDATE_REQUIRED",
      reasonCode: "CANDIDATE_KNOWLEDGE_STALE",
    });
  });

  it.each([
    ["First name", "FIRST_NAME"],
    ["Nome", "FIRST_NAME"],
    ["Primeiro nome", "FIRST_NAME"],
    ["Last name", "LAST_NAME"],
    ["Sobrenome", "LAST_NAME"],
    ["Phone", "PHONE"],
    ["Telefone", "PHONE"],
    ["Telefone celular", "PHONE"],
    ["Email", "APPLICATION_EMAIL"],
    ["E-mail", "APPLICATION_EMAIL"],
  ] as const)(
    "maps multilingual identity/contact label %s",
    (label, concept) => {
      expect(mapApplicationQuestionToCandidateConcept(question(label))).toBe(
        concept,
      );
    },
  );

  it("does not treat a Portuguese company-name field as the candidate's first name", () => {
    expect(
      mapApplicationQuestionToCandidateConcept(question("Nome da empresa")),
    ).toBeNull();
  });

  it("resolves equivalent multilingual identity and email controls from one concept each", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "application-duplicates",
      userId: "candidate-1",
      questions: [
        question("First name"),
        question("Nome"),
        question("Email"),
        question("E-mail"),
      ],
      knowledge: [
        knowledge(
          "FIRST_NAME",
          { text: "Avery" },
          { freshness: "NOT_APPLICABLE" },
        ),
        knowledge(
          "APPLICATION_EMAIL",
          { text: "avery@example.test" },
          { freshness: "NOT_APPLICABLE" },
        ),
      ],
    });
    expect(results.map((result) => result.value)).toEqual([
      "Avery",
      "Avery",
      "avery@example.test",
      "avery@example.test",
    ]);
    expect(
      results.every((result) => result.disposition === "AUTO_RESOLVED"),
    ).toBe(true);
  });

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

  it("resolves approved reusable proficiency without a freshness clock or AI", async () => {
    const fake = fakeAI([]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "application-1",
      userId: "candidate-1",
      questions: [question("English proficiency")],
      knowledge: [
        knowledge(
          "LANGUAGE_PROFICIENCY:english",
          { proficiency: "Professional fluent" },
          { freshness: "NOT_APPLICABLE" },
        ),
      ],
    });
    expect(result).toMatchObject({
      canonicalConcept: "LANGUAGE_PROFICIENCY:english",
      disposition: "AUTO_RESOLVED",
      value: "Professional fluent",
    });
    expect(fake.generateStructured).not.toHaveBeenCalled();
  });

  it("reuses one semantic proficiency across an employer with different raw IDs", async () => {
    const [result] = await resolveApplicationQuestions({
      correlationId: "application-second-employer",
      userId: "candidate-1",
      questions: [
        question("English proficiency", {
          fieldTypes: ["multi_value_single_select"],
          options: ["Basic", "Fluent"],
          optionIdentities: [
            { label: "Basic", value: "employer-b-basic" },
            { label: "Fluent", value: "employer-b-fluent" },
          ],
        }),
      ],
      knowledge: [
        knowledge(
          "LANGUAGE_PROFICIENCY:english",
          { text: "Fluent" },
          { freshness: "NOT_APPLICABLE" },
        ),
      ],
    });
    expect(result).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "employer-b-fluent",
    });
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
          "GENERAL_DATA_USE_PREFERENCE",
          { text: "Prefer minimal data use" },
          {
            applicationUse: "PREFERENCE_CONTEXT_ONLY",
            autoAnswerAllowed: false,
          },
        ),
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
        question(
          "Concordo que os dados pessoais serão coletados conforme a política do Inter",
          { controlDisposition: "CANDIDATE_REQUIRED_EXTERNAL" },
        ),
        question("AI interview consent", {
          controlDisposition: "CANDIDATE_REQUIRED_EXTERNAL",
        }),
        question("I legally attest that all information is accurate", {
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
      "HUMAN_REQUIRED",
      "HUMAN_REQUIRED",
      "UNSUPPORTED",
    ]);
  });

  it.each([
    "Inter privacy and data-processing consent",
    "AI interview transcription consent",
  ])(
    "requires an explicit application-scoped decision for %s even when a generic preference exists",
    async (label) => {
      const [result] = await resolveApplicationQuestions({
        correlationId: "application-1",
        userId: "candidate-1",
        knowledge: [
          knowledge(
            "GENERAL_DATA_USE_PREFERENCE",
            { text: "Prefer minimal data use" },
            {
              applicationUse: "PREFERENCE_CONTEXT_ONLY",
              autoAnswerAllowed: false,
            },
          ),
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
          question(label, {
            group: "COMPLIANCE",
            fieldTypes: ["external_consent"],
            options: ["Yes", "No"],
            controlDisposition: "ROLEPROWL_RESOLVED",
          }),
        ],
      });
      expect(result).toMatchObject({
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: [],
        reasonCode: "EXPLICIT_APPLICATION_DECISION_REQUIRED",
      });
    },
  );

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

  it("emits a bounded successful AI task outcome without candidate values", async () => {
    const candidateQuestion = question(
      "Describe how you communicate technical findings",
    );
    const reference = "REUSABLE_SELF_DESCRIPTION:ANSWER_MEMORY:memory-1";
    const fake = fakeAI([
      {
        questionId: candidateQuestion.id,
        canonicalConcept: "REUSABLE_SELF_DESCRIPTION",
        proposedValue: "I communicate technical findings to engineering teams.",
        candidateKnowledgeReferences: [reference],
        confidence: 0.9,
      },
    ]);
    const logger = safeLog();
    await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "application-observable",
      userId: "candidate-1",
      questions: [candidateQuestion],
      knowledge: [
        knowledge("REUSABLE_SELF_DESCRIPTION", {
          text: "Presented technical findings to engineering teams.",
        }),
      ],
      log: logger,
    });
    expect(logger.log).toHaveBeenCalledWith(
      "info",
      "ai_task_outcome",
      expect.objectContaining({
        task: "APPLICATION_QUESTION_RESOLUTION",
        status: "RESULTS_PROPOSED",
        reason: "GROUNDED_RESULTS_PROPOSED",
        questionCount: 1,
        resultCount: 1,
        latencyMs: expect.any(Number),
        retryCount: 0,
      }),
    );
    const serialized = JSON.stringify(logger.log.mock.calls);
    expect(serialized).not.toContain("Presented technical findings");
    expect(serialized).not.toContain("engineering teams");
  });

  it.each([
    [
      "POLICY_BLOCKED",
      new AIDataPolicyError("private Preview policy disabled"),
    ],
    ["INVALID_PROVIDER_OUTPUT", new AIInvalidOutputError("invalid schema")],
    ["PROVIDER_FAILED", new Error("timeout")],
  ] as const)(
    "preserves deterministic fallback and emits %s",
    async (status, failure) => {
      const logger = safeLog();
      const generateStructured = vi.fn(async () => {
        throw failure;
      });
      const [result] = await resolveApplicationQuestions({
        ai: { generateStructured } as unknown as AIProvider,
        correlationId: "application-failure",
        userId: "candidate-1",
        questions: [question("Tell us about communicating findings")],
        knowledge: [
          knowledge("REUSABLE_SELF_DESCRIPTION", {
            text: "Technical writing",
          }),
        ],
        log: logger,
      });
      expect(result).toMatchObject({
        disposition: "CANDIDATE_REQUIRED",
        reasonCode: "NO_GROUNDED_CANDIDATE_KNOWLEDGE",
      });
      expect(logger.log).toHaveBeenCalledWith(
        "warn",
        "ai_task_outcome",
        expect.objectContaining({ status, questionCount: 1, resultCount: 0 }),
      );
    },
  );

  it("emits an explicit skip when no safe candidate knowledge can support AI", async () => {
    const logger = safeLog();
    const fake = fakeAI([]);
    await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "application-no-evidence",
      userId: "candidate-1",
      questions: [question("Describe another relevant capability")],
      knowledge: [],
      log: logger,
    });
    expect(fake.generateStructured).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "info",
      "ai_task_outcome",
      expect.objectContaining({
        status: "NO_ELIGIBLE_QUESTIONS",
        reason: "NO_SAFE_SUPPORTED_CANDIDATE_KNOWLEDGE",
      }),
    );
  });

  it.each([
    [
      "returns no provider",
      (): AIProvider | undefined => undefined,
      "PROVIDER_CONFIGURATION_UNAVAILABLE",
    ],
    [
      "throws during construction",
      (): AIProvider | undefined => {
        throw new Error("provider bootstrap failed");
      },
      "PROVIDER_CONSTRUCTION_FAILED",
    ],
  ] as const)(
    "emits a terminal outcome when the provider factory %s",
    async (_case, aiFactory, reason) => {
      const logger = safeLog();
      await resolveApplicationQuestions({
        aiFactory,
        correlationId: "application-provider-construction",
        userId: "candidate-1",
        questions: [question("Describe another relevant capability")],
        knowledge: [
          knowledge("REUSABLE_SELF_DESCRIPTION", {
            text: "Technical writing",
          }),
        ],
        log: logger,
      });
      expect(logger.log).toHaveBeenCalledTimes(1);
      expect(logger.log).toHaveBeenCalledWith(
        "warn",
        "ai_task_outcome",
        expect.objectContaining({
          status:
            reason === "PROVIDER_CONFIGURATION_UNAVAILABLE"
              ? "PROVIDER_DISABLED"
              : "PROVIDER_FAILED",
          reason,
          questionCount: 1,
          resultCount: 0,
          latencyMs: expect.any(Number),
          retryCount: 0,
        }),
      );
    },
  );

  it("reports provider results that are all discarded as unsupported", async () => {
    const candidateQuestion = question(
      "Describe how you communicate technical findings",
    );
    const fake = fakeAI([
      {
        questionId: candidateQuestion.id,
        canonicalConcept: "REUSABLE_SELF_DESCRIPTION",
        proposedValue: "Invented leadership claim",
        candidateKnowledgeReferences: [
          "REUSABLE_SELF_DESCRIPTION:ANSWER_MEMORY:memory-1",
        ],
        confidence: 0.9,
      },
    ]);
    const logger = safeLog();
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "application-discarded-output",
      userId: "candidate-1",
      questions: [candidateQuestion],
      knowledge: [
        knowledge("REUSABLE_SELF_DESCRIPTION", {
          text: "Technical writing",
        }),
      ],
      log: logger,
    });
    expect(result.disposition).toBe("CANDIDATE_REQUIRED");
    expect(logger.log).toHaveBeenCalledWith(
      "info",
      "ai_task_outcome",
      expect.objectContaining({
        status: "NO_SUPPORTED_RESULTS",
        reason: "ALL_RESULTS_REJECTED",
        questionCount: 1,
        resultCount: 0,
      }),
    );
  });

  it("classifies the ten observed Inter residuals as candidate-controlled rather than AI-eligible", async () => {
    const external = {
      controlDisposition: "CANDIDATE_REQUIRED_EXTERNAL",
    } as const;
    const questions = [
      question("CPF", external),
      question("Você trabalha atualmente no Inter?"),
      question("Se você trabalha no Inter, informe seu nome completo"),
      question(
        "Concordo que os dados pessoais serão coletados conforme a política do Inter",
        external,
      ),
      question("Você possui curso superior completo?"),
      question("Qual é a sua remuneração atual?"),
      question("Quais são seus benefícios atuais?"),
      question(
        "Concordo com entrevista por IA e processamento de dados",
        external,
      ),
      question("Qual o seu nível de fluência na língua inglesa?"),
      question("Qual o seu nível de fluência na língua espanhola?"),
    ];
    const fake = fakeAI([]);
    const logger = safeLog();
    const results = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "inter-residual-fixture",
      userId: "candidate-1",
      questions,
      knowledge: [
        knowledge("REUSABLE_SELF_DESCRIPTION", {
          text: "I communicate security findings to engineering teams.",
        }),
      ],
      jurisdictionContext: { jobLocations: ["São Paulo, SP"] },
      log: logger,
    });
    expect(fake.generateStructured).not.toHaveBeenCalled();
    expect(results.map((result) => result.reasonCode)).toEqual([
      "EXTERNAL_OR_SENSITIVE_CONTROL",
      "EMPLOYER_SPECIFIC_ANSWER",
      "EMPLOYER_SPECIFIC_ANSWER",
      "EXTERNAL_OR_SENSITIVE_CONTROL",
      "EDUCATION_COMPLETION_NOT_ESTABLISHED",
      "CANDIDATE_KNOWLEDGE_MISSING",
      "UNKNOWN_CONSEQUENTIAL_QUESTION",
      "EXTERNAL_OR_SENSITIVE_CONTROL",
      "CANDIDATE_KNOWLEDGE_MISSING",
      "CANDIDATE_KNOWLEDGE_MISSING",
    ]);
    expect(logger.log).toHaveBeenCalledWith(
      "info",
      "ai_task_outcome",
      expect.objectContaining({
        status: "NO_ELIGIBLE_QUESTIONS",
        reason: "ALL_QUESTIONS_DETERMINISTICALLY_CLASSIFIED",
      }),
    );
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

  it("auto-selects an exact completed education taxonomy match by raw identity", async () => {
    const course = question("Em qual curso você se formou?", {
      fieldTypes: ["multi_value_multi_select"],
      fieldNames: ["question_course[]"],
      options: ["Ciência da Computação", "Engenharia de Computação"],
      optionIdentities: [
        { label: "Ciência da Computação", value: "course-100" },
        { label: "Engenharia de Computação", value: "course-200" },
      ],
    });
    const [result] = await resolveApplicationQuestions({
      correlationId: "education-exact",
      userId: "candidate-1",
      questions: [course],
      knowledge: [
        knowledge("EDUCATION_HISTORY", {
          items: [
            {
              identity: "education-1",
              program: "Ciência da Computação",
              status: "Concluído",
            },
          ],
        }),
      ],
    });
    expect(result).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: '["course-100"]',
      reasonCode: "EXACT_TAXONOMY_MATCH",
      canonicalConcept: "EDUCATION_HISTORY",
    });
  });

  it("maps a grounded semantic education label to the current raw identity", async () => {
    const course = question("Em qual curso você se formou?", {
      fieldTypes: ["multi_value_multi_select"],
      options: [
        "Ciência da Computação",
        "Engenharia de Computação",
        "Sistemas de Informação",
      ],
      optionIdentities: [
        { label: "Ciência da Computação", value: "course-100" },
        { label: "Engenharia de Computação", value: "course-200" },
        { label: "Sistemas de Informação", value: "course-300" },
      ],
    });
    const fake = fakeAI([
      {
        questionId: course.id,
        canonicalConcept: "EDUCATION_HISTORY",
        resolutionClass: "TAXONOMY_TARGET",
        canonicalSemanticAnswer: "Ciência da Computação",
        employerOptionTargets: ["Ciência da Computação"],
        candidateEvidenceIds: [
          "EDUCATION_HISTORY:ANSWER_MEMORY:memory-1:item-1",
        ],
        jobEvidenceIds: [],
        grounding: "GROUNDED",
        answerBasis: "FACTUAL",
        reasonCode: "EQUIVALENT_DEGREE_FIELD",
        confidence: 0.98,
        requiresCandidateConfirmation: false,
      },
    ]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "education-semantic",
      userId: "candidate-1",
      questions: [course],
      knowledge: [
        knowledge("EDUCATION_HISTORY", {
          items: [
            {
              identity: "education-1",
              program: "Computer Science",
              endDate: "2024-12-01T00:00:00.000Z",
            },
          ],
        }),
      ],
    });
    expect(result).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: '["course-100"]',
      reasonCode: "SEMANTIC_TAXONOMY_MATCH",
    });
    expect(fake.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          mode: "CHOICE_TAXONOMY",
          allowedConcepts: ["EDUCATION_HISTORY"],
          questions: [
            expect.objectContaining({
              candidateKnowledge: [
                {
                  concept: "EDUCATION_HISTORY",
                  referenceId:
                    "EDUCATION_HISTORY:ANSWER_MEMORY:memory-1:item-1",
                  value: "Computer Science",
                },
              ],
            }),
          ],
        }),
      }),
    );
  });

  it("keeps ambiguous semantic education mapping candidate-controlled", async () => {
    const course = question("Degree field or course", {
      fieldTypes: ["multi_value_multi_select"],
      options: [
        "Ciência da Computação",
        "Engenharia de Computação",
        "Sistemas de Informação",
      ],
      optionIdentities: [
        { label: "Ciência da Computação", value: "100" },
        { label: "Engenharia de Computação", value: "200" },
        { label: "Sistemas de Informação", value: "300" },
      ],
    });
    const fake = fakeAI([
      {
        questionId: course.id,
        canonicalConcept: "EDUCATION_HISTORY",
        resolutionClass: "TAXONOMY_TARGET",
        canonicalSemanticAnswer: "Ciência da Computação",
        employerOptionTargets: ["Ciência da Computação"],
        candidateEvidenceIds: [
          "EDUCATION_HISTORY:ANSWER_MEMORY:memory-1:item-1",
        ],
        jobEvidenceIds: [],
        grounding: "GROUNDED",
        answerBasis: "FACTUAL",
        reasonCode: "AMBIGUOUS_DEGREE_FIELD",
        confidence: 0.8,
        requiresCandidateConfirmation: true,
      },
    ]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "education-ambiguous",
      userId: "candidate-1",
      questions: [course],
      knowledge: [
        knowledge("EDUCATION_HISTORY", {
          items: [
            {
              program: "Computing and technology",
              status: "Graduated",
            },
          ],
        }),
      ],
    });
    expect(result).toMatchObject({
      disposition: "PROPOSED_FOR_CANDIDATE",
      value: '["100"]',
      reasonCode: "SEMANTIC_TAXONOMY_APPROVAL_REQUIRED",
    });
  });

  it("rejects a semantic option identity outside the supplied employer taxonomy", async () => {
    const course = question("Degree field or course", {
      fieldTypes: ["multi_value_multi_select"],
      options: ["Ciência da Computação", "Sistemas de Informação"],
      optionIdentities: [
        { label: "Ciência da Computação", value: "100" },
        { label: "Sistemas de Informação", value: "200" },
      ],
    });
    const fake = fakeAI([
      {
        questionId: course.id,
        canonicalConcept: "EDUCATION_HISTORY",
        resolutionClass: "TAXONOMY_TARGET",
        canonicalSemanticAnswer: "Invented option",
        employerOptionTargets: ["Invented option"],
        candidateEvidenceIds: [
          "EDUCATION_HISTORY:ANSWER_MEMORY:memory-1:item-1",
        ],
        jobEvidenceIds: [],
        grounding: "GROUNDED",
        answerBasis: "FACTUAL",
        reasonCode: "FORGED_OPTION",
        confidence: 1,
        requiresCandidateConfirmation: false,
      },
    ]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "education-forged-option",
      userId: "candidate-1",
      questions: [course],
      knowledge: [
        knowledge("EDUCATION_HISTORY", {
          items: [{ program: "Computer Science", status: "Graduated" }],
        }),
      ],
    });
    expect(result).toMatchObject({
      disposition: "CANDIDATE_REQUIRED",
      value: null,
      reasonCode: "NO_GROUNDED_CANDIDATE_KNOWLEDGE",
    });
  });

  it("uses NA only from an explicit negative controlling answer and instruction", async () => {
    const completion = question("Você possui curso superior completo?", {
      fieldTypes: ["multi_value_single_select"],
      options: ["Sim", "Não"],
      optionIdentities: [
        { label: "Sim", value: "yes-id" },
        { label: "Não", value: "no-id" },
      ],
    });
    const course = question(
      "Caso tenha respondido NÃO para a pergunta anterior, selecione NA. Em qual curso você se formou?",
      {
        fieldTypes: ["multi_value_multi_select"],
        options: ["NA", "Ciência da Computação"],
        optionIdentities: [
          { label: "NA", value: "na-id" },
          { label: "Ciência da Computação", value: "course-id" },
        ],
      },
    );
    const results = await resolveApplicationQuestions({
      applicationAnswers: { [completion.id]: "no-id" },
      correlationId: "education-na",
      userId: "candidate-1",
      questions: [completion, course],
      knowledge: [],
    });
    expect(results[1]).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: '["na-id"]',
      reasonCode: "EXPLICIT_CONTROLLING_ANSWER_SELECTED_SENTINEL",
    });
  });

  it("keeps an explicit employer relationship answer application-scoped and above automation", async () => {
    const relationship = question(
      "Você conhece alguém que trabalha no Inter?",
      {
        fieldTypes: ["multi_value_multi_select"],
        options: ["I do not know anyone at Inter", "Friend"],
        optionIdentities: [
          {
            label: "I do not know anyone at Inter",
            value: "no-known-employee-id",
          },
          { label: "Friend", value: "friend-id" },
        ],
      },
    );
    const fake = fakeAI([]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      applicationAnswers: {
        [relationship.id]: '["no-known-employee-id"]',
      },
      correlationId: "explicit-employer-relationship",
      userId: "candidate-1",
      questions: [relationship],
      knowledge: [],
    });
    expect(result).toEqual({
      questionId: relationship.id,
      canonicalConcept: null,
      disposition: "AUTO_RESOLVED",
      value: '["no-known-employee-id"]',
      candidateKnowledgeReferences: [],
      reasonCode: "APPLICATION_OVERRIDE",
    });
    expect(fake.generateStructured).not.toHaveBeenCalled();
  });

  it("does not infer an employer relationship or education completion from absence", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "closed-world",
      userId: "candidate-1",
      questions: [
        question("Você conhece alguém que trabalha no Inter?", {
          fieldTypes: ["multi_value_multi_select"],
          options: ["Não conheço", "Amigo"],
        }),
        question("Você possui curso superior completo?", {
          fieldTypes: ["multi_value_single_select"],
          options: ["Sim", "Não"],
        }),
      ],
      knowledge: [],
    });
    expect(results.map((result) => result.reasonCode)).toEqual([
      "EMPLOYER_SPECIFIC_RELATIONSHIP_REQUIRED",
      "EDUCATION_COMPLETION_NOT_ESTABLISHED",
    ]);
  });

  it("does not infer completion merely because an education row exists", async () => {
    const fake = fakeAI([]);
    const results = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "education-row-without-completion",
      userId: "candidate-1",
      questions: [
        question("Você possui curso superior completo?", {
          fieldTypes: ["multi_value_single_select"],
          options: ["Sim", "Não"],
        }),
        question("Em qual curso você se formou?", {
          fieldTypes: ["multi_value_multi_select"],
          options: ["Ciência da Computação", "Sistemas de Informação"],
        }),
      ],
      knowledge: [
        knowledge("EDUCATION_HISTORY", {
          items: [{ program: "Ciência da Computação" }],
        }),
      ],
    });
    expect(results.map((result) => result.reasonCode)).toEqual([
      "EDUCATION_COMPLETION_NOT_ESTABLISHED",
      "EDUCATION_COMPLETION_NOT_ESTABLISHED",
    ]);
    expect(fake.generateStructured).not.toHaveBeenCalled();
  });

  it("selects the raw Yes identity only when completion is explicitly established", async () => {
    const [result] = await resolveApplicationQuestions({
      correlationId: "education-completion-established",
      userId: "candidate-1",
      questions: [
        question("Você possui curso superior completo?", {
          fieldTypes: ["multi_value_single_select"],
          options: ["Sim", "Não"],
          optionIdentities: [
            { label: "Sim", value: "yes-raw-id" },
            { label: "Não", value: "no-raw-id" },
          ],
        }),
      ],
      knowledge: [
        knowledge("EDUCATION_HISTORY", {
          items: [
            {
              program: "Ciência da Computação",
              endDate: "2024-12-01T00:00:00.000Z",
            },
          ],
        }),
      ],
    });
    expect(result).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "yes-raw-id",
      reasonCode: "EDUCATION_COMPLETION_ESTABLISHED",
    });
  });

  it("falls back to a manual candidate decision when taxonomy AI is unavailable", async () => {
    const [result] = await resolveApplicationQuestions({
      correlationId: "education-ai-disabled",
      userId: "candidate-1",
      questions: [
        question("Em qual curso você se formou?", {
          fieldTypes: ["multi_value_multi_select"],
          options: ["Ciência da Computação", "Sistemas de Informação"],
        }),
      ],
      knowledge: [
        knowledge("EDUCATION_HISTORY", {
          items: [{ program: "Computer Science", status: "Graduated" }],
        }),
      ],
    });
    expect(result).toMatchObject({
      disposition: "CANDIDATE_REQUIRED",
      reasonCode: "NO_GROUNDED_CANDIDATE_KNOWLEDGE",
    });
  });

  it("reduces the two-control Inter taxonomy fixture to one genuine candidate decision", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "inter-taxonomy-residual",
      userId: "candidate-1",
      questions: [
        question("Você conhece alguém que trabalha no Inter?", {
          fieldTypes: ["multi_value_multi_select"],
          options: ["I do not know anyone at Inter", "Friend"],
          optionIdentities: [
            {
              label: "I do not know anyone at Inter",
              value: "relationship-none",
            },
            { label: "Friend", value: "relationship-friend" },
          ],
        }),
        question(
          "Caso você tenha respondido SIM para a pergunta anterior, em qual curso você se formou? Caso você tenha respondido NÃO, preencha o campo abaixo com NA",
          {
            fieldTypes: ["multi_value_multi_select"],
            options: [
              "NA",
              "Administração",
              "Ciência da Computação",
              "Engenharia de Computação",
            ],
            optionIdentities: [
              { label: "NA", value: "course-na" },
              { label: "Administração", value: "course-admin" },
              {
                label: "Ciência da Computação",
                value: "course-computer-science",
              },
              {
                label: "Engenharia de Computação",
                value: "course-computer-engineering",
              },
            ],
          },
        ),
      ],
      knowledge: [
        knowledge("EDUCATION_HISTORY", {
          items: [
            {
              program: "Ciência da Computação",
              status: "Concluído",
            },
          ],
        }),
      ],
    });
    expect(results).toEqual([
      expect.objectContaining({
        disposition: "CANDIDATE_REQUIRED",
        reasonCode: "EMPLOYER_SPECIFIC_RELATIONSHIP_REQUIRED",
      }),
      expect.objectContaining({
        disposition: "AUTO_RESOLVED",
        value: '["course-computer-science"]',
        reasonCode: "EXACT_TAXONOMY_MATCH",
      }),
    ]);
    expect(
      results.filter((result) => result.disposition === "CANDIDATE_REQUIRED"),
    ).toHaveLength(1);
  });
});
