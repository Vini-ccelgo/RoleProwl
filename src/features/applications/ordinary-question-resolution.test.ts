import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/core/contracts/ai-provider";
import { AIDataPolicyError } from "@/core/errors/application-errors";
import type {
  CandidateKnowledgeConcept,
  CandidateKnowledgeQueryResult,
} from "@/core/domain/candidate/candidate-knowledge";
import type { ResolvableApplicationQuestion } from "@/core/domain/applications/application-question-resolution";
import { candidateInterventionMetric } from "@/core/domain/applications/candidate-intervention-metric";
import { resolveApplicationQuestions } from "./resolve-application-questions";

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
    confirmedAt: new Date("2026-09-17T00:00:00.000Z"),
    freshness: "CURRENT",
    origin: "EXPLICIT",
    provenance: { source: "ANSWER_MEMORY", sourceId: `${concept}-1` },
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

const noticeQuestion = question("Notice period", {
  fieldTypes: ["multi_value_single_select"],
  options: ["Immediately", "2 weeks", "30 days", "60 days"],
  optionIdentities: [
    { label: "Immediately", value: "notice-now" },
    { label: "2 weeks", value: "notice-14" },
    { label: "30 days", value: "notice-30" },
    { label: "60 days", value: "notice-60" },
  ],
});

describe("ordinary application question resolution", () => {
  it("normalizes an uppercase candidate name only for employer presentation", async () => {
    const candidateName = { text: "  MAYA-LEE  " };
    const [result] = await resolveApplicationQuestions({
      correlationId: "name-presentation",
      userId: "candidate-1",
      questions: [question("First name")],
      knowledge: [knowledge("FIRST_NAME", candidateName)],
    });
    expect(result).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "Maya-Lee",
    });
    expect(candidateName.text).toBe("  MAYA-LEE  ");
  });

  it("maps an exact reusable notice period to the raw employer identity before AI", async () => {
    const fake = fakeAI([]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "notice-exact",
      userId: "candidate-1",
      questions: [noticeQuestion],
      knowledge: [knowledge("NOTICE_PERIOD", { text: "30 days" })],
    });
    expect(result).toMatchObject({
      canonicalConcept: "NOTICE_PERIOD",
      disposition: "AUTO_RESOLVED",
      value: "notice-30",
    });
    expect(fake.generateStructured).not.toHaveBeenCalled();
  });

  it("keeps a notice taxonomy mismatch candidate-controlled", async () => {
    const [result] = await resolveApplicationQuestions({
      correlationId: "notice-mismatch",
      userId: "candidate-1",
      questions: [noticeQuestion],
      knowledge: [knowledge("NOTICE_PERIOD", { text: "45 days" })],
    });
    expect(result).toMatchObject({
      canonicalConcept: "NOTICE_PERIOD",
      disposition: "CANDIDATE_REQUIRED",
      reasonCode: "FIELD_TAXONOMY_MISMATCH",
    });
  });

  it("maps explicit start availability to an exact employer option identity", async () => {
    const [result] = await resolveApplicationQuestions({
      correlationId: "start-availability",
      userId: "candidate-1",
      questions: [
        question("When are you available to start?", {
          fieldTypes: ["multi_value_single_select"],
          options: ["Immediately", "In 2 weeks"],
          optionIdentities: [
            { label: "Immediately", value: "start-now" },
            { label: "In 2 weeks", value: "start-two-weeks" },
          ],
        }),
      ],
      knowledge: [knowledge("START_AVAILABILITY", { text: "Immediately" })],
    });
    expect(result).toMatchObject({
      canonicalConcept: "START_AVAILABILITY",
      disposition: "AUTO_RESOLVED",
      value: "start-now",
    });
  });

  it("lets AI select existing relevant experience IDs while code owns duration", async () => {
    const relevant = question("Years of experience relevant to this position");
    const proposition = relevant.label;
    const fake = fakeAI([
      {
        questionId: relevant.id,
        canonicalConcept: null,
        contextualKind: "RELEVANT_EXPERIENCE",
        proposition,
        supported: true,
        proposedValue: "99 years",
        candidateKnowledgeReferences: ["EXPERIENCE:consultant"],
        confidence: 0.95,
      },
    ]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "ai-relevant-experience",
      userId: "candidate-1",
      questions: [relevant],
      knowledge: [
        knowledge("EMPLOYMENT_HISTORY", {
          items: [
            {
              identity: "consultant",
              title: "Systems Consultant",
              employer: "Example",
              startDate: "2023-01-01T00:00:00.000Z",
              endDate: "2025-01-01T00:00:00.000Z",
            },
          ],
        }),
      ],
      jobContext: { title: "Platform Engineer" },
      now: new Date("2026-09-17T00:00:00.000Z"),
    });
    expect(result).toMatchObject({
      disposition: "PROPOSED_FOR_CANDIDATE",
      value: "2 years",
      reasonCode: "CONTEXTUAL_EXPERIENCE_DURATION_APPROVAL_REQUIRED",
    });
    expect(result.value).not.toBe("99 years");
    expect(fake.generateStructured).toHaveBeenCalledOnce();
  });

  it("rejects an invented experience ID from AI", async () => {
    const relevant = question("Years of experience relevant to this position");
    const fake = fakeAI([
      {
        questionId: relevant.id,
        canonicalConcept: null,
        contextualKind: "RELEVANT_EXPERIENCE",
        proposition: relevant.label,
        supported: true,
        proposedValue: null,
        candidateKnowledgeReferences: ["EXPERIENCE:invented"],
        confidence: 1,
      },
    ]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "ai-invented-experience",
      userId: "candidate-1",
      questions: [relevant],
      knowledge: [
        knowledge("EMPLOYMENT_HISTORY", {
          items: [
            {
              identity: "real",
              title: "Systems Consultant",
              employer: "Example",
              startDate: "2023-01-01T00:00:00.000Z",
              endDate: "2025-01-01T00:00:00.000Z",
            },
          ],
        }),
      ],
      jobContext: { title: "Platform Engineer" },
    });
    expect(result).toMatchObject({
      disposition: "CANDIDATE_REQUIRED",
      reasonCode: "NO_GROUNDED_CANDIDATE_KNOWLEDGE",
    });
  });

  it("batches multiple contextual questions into one optional AI call", async () => {
    const fake = fakeAI([]);
    const questions = [
      question("Previous experience as an Account Executive?"),
      question("Existing experience in B2B SaaS sales?"),
    ];
    const results = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "contextual-batch",
      userId: "candidate-1",
      questions,
      knowledge: [
        knowledge("EMPLOYMENT_HISTORY", {
          items: [
            {
              identity: "security",
              title: "Security Analyst",
              employer: "Example",
              startDate: "2023-01-01T00:00:00.000Z",
              endDate: "2025-01-01T00:00:00.000Z",
            },
          ],
        }),
      ],
      jobContext: { title: "Account Executive" },
    });
    expect(fake.generateStructured).toHaveBeenCalledOnce();
    expect(
      results.every((result) => result.disposition === "CANDIDATE_REQUIRED"),
    ).toBe(true);
  });

  it("preserves deterministic results when contextual AI is policy-blocked or times out", async () => {
    const questions = [
      noticeQuestion,
      question("Previous experience as an Account Executive?"),
    ];
    const candidateKnowledge = [
      knowledge("NOTICE_PERIOD", { text: "30 days" }),
      knowledge("EMPLOYMENT_HISTORY", {
        items: [
          {
            identity: "security",
            title: "Security Analyst",
            employer: "Example",
            startDate: "2023-01-01T00:00:00.000Z",
            endDate: "2025-01-01T00:00:00.000Z",
          },
        ],
      }),
    ];
    for (const failure of [
      new AIDataPolicyError("blocked"),
      new Error("timeout"),
    ]) {
      const generateStructured = vi.fn(async () => {
        throw failure;
      });
      const results = await resolveApplicationQuestions({
        ai: { generateStructured } as unknown as AIProvider,
        correlationId: "contextual-failure",
        userId: "candidate-1",
        questions,
        knowledge: candidateKnowledge,
      });
      expect(results[0]).toMatchObject({
        disposition: "AUTO_RESOLVED",
        value: "notice-30",
      });
      expect(results[1]?.disposition).toBe("CANDIDATE_REQUIRED");
      expect(generateStructured).toHaveBeenCalledOnce();
    }
  });

  it("keeps an application override above contextual resolution", async () => {
    const [result] = await resolveApplicationQuestions({
      applicationAnswers: { [noticeQuestion.id]: "notice-60" },
      correlationId: "override-first",
      userId: "candidate-1",
      questions: [noticeQuestion],
      knowledge: [knowledge("NOTICE_PERIOD", { text: "30 days" })],
    });
    expect(result).toMatchObject({
      value: "notice-60",
      reasonCode: "APPLICATION_OVERRIDE",
    });
  });

  it("does not route protected controls through contextual resolution", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "protected-contextual-controls",
      userId: "candidate-1",
      questions: [
        question("Current compensation", { group: "COMPLIANCE" }),
        question("Country of residence", {
          controlDisposition: "CANDIDATE_REQUIRED_EXTERNAL",
        }),
      ],
      knowledge: [
        knowledge("CURRENT_COMPENSATION", {
          amount: 6_500,
          currency: "BRL",
          period: "monthly",
        }),
        knowledge("CURRENT_LOCATION", { text: "São Paulo, Brazil" }),
      ],
    });
    expect(results).toEqual([
      expect.objectContaining({
        disposition: "CANDIDATE_REQUIRED",
        reasonCode: "EXPLICIT_APPLICATION_DECISION_REQUIRED",
      }),
      expect.objectContaining({
        disposition: "HUMAN_REQUIRED",
        reasonCode: "EXTERNAL_OR_SENSITIVE_CONTROL",
      }),
    ]);
  });
});

describe("held-out generalized application resolution", () => {
  const employment = knowledge("EMPLOYMENT_HISTORY", {
    items: [
      {
        identity: "security-engineer",
        title: "Security Engineer",
        employer: "Northstar Digital",
        startDate: "2022-01-01T00:00:00.000Z",
        endDate: "2025-01-01T00:00:00.000Z",
        responsibilities: [
          "Protected cloud estates and automated controls with Python",
        ],
      },
    ],
  });
  const skill = knowledge("SKILLS", {
    items: [{ identity: "python", text: "Python" }],
  });

  function semanticResolution(input: {
    questionId: string;
    resolutionClass?:
      | "FACTUAL_VALUE"
      | "PROFESSIONAL_PREDICATE"
      | "EXPERIENCE_DURATION"
      | "TAXONOMY_TARGET";
    concept?: CandidateKnowledgeConcept | null;
    answer?: string | null;
    evidenceIds: readonly string[];
    optionTargets?: readonly string[];
    requiresConfirmation?: boolean;
  }) {
    return {
      questionId: input.questionId,
      resolutionClass: input.resolutionClass ?? "PROFESSIONAL_PREDICATE",
      canonicalConcept: input.concept ?? null,
      canonicalSemanticAnswer: input.answer ?? "Yes",
      candidateEvidenceIds: input.evidenceIds,
      jobEvidenceIds: [],
      grounding: "GROUNDED",
      answerBasis: "FACTUAL",
      employerOptionTargets: input.optionTargets ?? [],
      requiresCandidateConfirmation: input.requiresConfirmation ?? false,
      reasonCode: "SUPPORTED_BY_CITED_EVIDENCE",
      confidence: 0.96,
    };
  }

  it("auto-resolves an unfamiliar professional paraphrase from cited history", async () => {
    const heldOut = question(
      "Has your work ever required safeguarding cloud estates?",
      { options: ["Yes", "No"], fieldTypes: ["input_radio"] },
    );
    const fake = fakeAI([
      semanticResolution({
        questionId: heldOut.id,
        evidenceIds: ["EXPERIENCE:security-engineer"],
      }),
    ]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "held-out-cloud-paraphrase",
      userId: "candidate-1",
      questions: [heldOut],
      knowledge: [employment],
    });
    expect(result).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "Yes",
      reasonCode: "EXPLICIT_EXPERIENCE_SUPPORTS_YES",
      resolutionMetadata: {
        method: "SEMANTIC_AI",
        taskVersion: "application-question-resolution-v4",
      },
    });
  });

  it("keeps raw employer identities out of AI and maps a multilingual semantic target in code", async () => {
    const heldOut = question("Assinale a tecnologia que domina", {
      options: ["Java", "Python", "Rust"],
      optionIdentities: [
        { label: "Java", value: "raw-10" },
        { label: "Python", value: "raw-20" },
        { label: "Rust", value: "raw-30" },
      ],
      fieldTypes: ["multi_value_single_select"],
    });
    const fake = fakeAI([
      semanticResolution({
        questionId: heldOut.id,
        resolutionClass: "TAXONOMY_TARGET",
        concept: "SKILLS",
        answer: "Python",
        evidenceIds: ["SKILL:python"],
        optionTargets: ["Python"],
      }),
    ]);
    const [result] = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "held-out-multilingual-taxonomy",
      userId: "candidate-1",
      questions: [heldOut],
      knowledge: [skill],
    });
    expect(result).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "raw-20",
    });
    const sent = JSON.stringify(
      fake.generateStructured.mock.calls[0] as unknown,
    );
    expect(sent).toContain('"optionLabels":["Java","Python","Rust"]');
    expect(sent).not.toContain("raw-10");
    expect(sent).not.toContain("raw-20");
    expect(sent).not.toContain("raw-30");
  });

  it("permits an unseen professional-history negative only with both current authorities", async () => {
    const heldOut = question(
      "Has enterprise selling ever formed part of your remit?",
      { options: ["Yes", "No"], fieldTypes: ["input_radio"] },
    );
    const authorityIds = [
      "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION:ANSWER_MEMORY:PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION-1",
      "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION:ANSWER_MEMORY:NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION-1",
    ];
    const output = semanticResolution({
      questionId: heldOut.id,
      answer: "No",
      evidenceIds: authorityIds,
    });
    const authorities = [
      knowledge(
        "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
        { attested: true },
        { applicationUse: "PREFERENCE_CONTEXT_ONLY", autoAnswerAllowed: false },
      ),
      knowledge(
        "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
        { authorized: true },
        { applicationUse: "PREFERENCE_CONTEXT_ONLY", autoAnswerAllowed: false },
      ),
    ];
    const withAuthority = await resolveApplicationQuestions({
      ai: fakeAI([output]).ai,
      correlationId: "held-out-negative-authorized",
      userId: "candidate-1",
      questions: [heldOut],
      knowledge: [employment, ...authorities],
    });
    const withoutAuthority = await resolveApplicationQuestions({
      ai: fakeAI([output]).ai,
      correlationId: "held-out-negative-unauthorized",
      userId: "candidate-1",
      questions: [heldOut],
      knowledge: [employment],
    });
    expect(withAuthority[0]).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "No",
      reasonCode: "SEMANTIC_COMPLETE_HISTORY_SUPPORTS_NO",
    });
    expect(withoutAuthority[0]).toMatchObject({
      disposition: "CANDIDATE_REQUIRED",
      value: null,
    });
  });

  it("limits one semantic batch to 25 questions and leaves the remainder candidate-controlled", async () => {
    const questions = Array.from({ length: 30 }, (_, index) =>
      question(`Unfamiliar professional capability ${index}`),
    );
    const fake = fakeAI([]);
    const results = await resolveApplicationQuestions({
      ai: fake.ai,
      correlationId: "bounded-general-batch",
      userId: "candidate-1",
      questions,
      knowledge: [skill],
    });
    expect(fake.generateStructured).toHaveBeenCalledOnce();
    const [request] = fake.generateStructured.mock.calls[0] as unknown as [
      { readonly input: { readonly questions: readonly unknown[] } },
    ];
    expect(request.input.questions).toHaveLength(25);
    expect(results).toHaveLength(30);
    expect(
      results.every((item) => item.disposition === "CANDIDATE_REQUIRED"),
    ).toBe(true);
  });

  it("measures ten heterogeneous schemas with no fabricated factual resolution", async () => {
    const authority = [
      knowledge(
        "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
        { attested: true },
        { applicationUse: "PREFERENCE_CONTEXT_ONLY", autoAnswerAllowed: false },
      ),
      knowledge(
        "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
        { authorized: true },
        { applicationUse: "PREFERENCE_CONTEXT_ONLY", autoAnswerAllowed: false },
      ),
    ];
    interface EvaluationFixture {
      readonly name: string;
      readonly questions: readonly ResolvableApplicationQuestion[];
      readonly knowledge: readonly CandidateKnowledgeQueryResult[];
      readonly semanticEvidenceId?: string;
      readonly taxonomy?: boolean;
      readonly requiresConfirmation?: boolean;
    }
    const fixtures: readonly EvaluationFixture[] = [
      {
        name: "matching cybersecurity role",
        questions: [
          question("Do you have Python experience?", {
            options: ["Yes", "No"],
            fieldTypes: ["input_radio"],
          }),
        ],
        knowledge: [employment],
      },
      {
        name: "deliberately mismatched sales role",
        questions: [
          question("Existing experience in enterprise sales?", {
            options: ["Yes", "No"],
            fieldTypes: ["input_radio"],
          }),
        ],
        knowledge: [employment],
      },
      {
        name: "software terminology",
        questions: [
          question("Have you produced automation in a scripting language?", {
            options: ["Yes", "No"],
          }),
        ],
        knowledge: [skill],
        semanticEvidenceId: "SKILL:python",
      },
      {
        name: "operations and business",
        questions: [
          question("Has your remit included operational control design?", {
            options: ["Yes", "No"],
          }),
        ],
        knowledge: [
          knowledge(
            "PROJECTS",
            {
              items: [
                { identity: "controls", title: "Operational control design" },
              ],
            },
            { autoAnswerAllowed: false },
          ),
        ],
        semanticEvidenceId: "PROJECT:controls",
        requiresConfirmation: true,
      },
      {
        name: "multilingual question",
        questions: [
          question("Já protegeu ambientes de nuvem?", {
            options: ["Sim", "Não"],
          }),
        ],
        knowledge: [employment],
        semanticEvidenceId: "EXPERIENCE:security-engineer",
      },
      {
        name: "unfamiliar paraphrase",
        questions: [
          question(
            "Did safeguarding digital estates form part of your remit?",
            { options: ["Yes", "No"] },
          ),
        ],
        knowledge: [employment],
        semanticEvidenceId: "EXPERIENCE:security-engineer",
      },
      {
        name: "large choice taxonomy",
        questions: [
          question("Select the substantiated capability", {
            options: [
              "C",
              "C++",
              "C#",
              "Go",
              "Java",
              "JavaScript",
              "Kotlin",
              "PHP",
              "Python",
              "Ruby",
              "Rust",
              "Swift",
            ],
            fieldTypes: ["multi_value_single_select"],
          }),
        ],
        knowledge: [skill],
        semanticEvidenceId: "SKILL:python",
        taxonomy: true,
      },
      {
        name: "conflicting candidate evidence",
        questions: [
          question("Has your remit included platform engineering?", {
            options: ["Yes", "No"],
          }),
        ],
        knowledge: [
          knowledge(
            "SKILLS",
            { items: [{ identity: "platform", text: "Platform engineering" }] },
            { conflict: true },
          ),
        ],
      },
      {
        name: "sparse resume",
        questions: [
          question("Has your remit included forensic investigation?", {
            options: ["Yes", "No"],
          }),
          question("Upload a government record", {
            controlDisposition: "CANDIDATE_REQUIRED_EXTERNAL",
          }),
        ],
        knowledge: [],
      },
      {
        name: "complete history negative",
        questions: [
          question("Existing experience in enterprise sales?", {
            options: ["Yes", "No"],
          }),
        ],
        knowledge: [employment, ...authority],
      },
    ];

    const matrix = [];
    for (const fixture of fixtures) {
      const semanticEvidenceId = fixture.semanticEvidenceId;
      const semanticQuestion = semanticEvidenceId
        ? (fixture.questions[0] ?? null)
        : null;
      const fake = fakeAI(
        semanticQuestion
          ? [
              semanticResolution({
                questionId: semanticQuestion.id,
                resolutionClass: fixture.taxonomy
                  ? "TAXONOMY_TARGET"
                  : "PROFESSIONAL_PREDICATE",
                concept: fixture.taxonomy ? "SKILLS" : null,
                answer: fixture.taxonomy ? "Python" : "Yes",
                evidenceIds: [semanticEvidenceId!],
                optionTargets: fixture.taxonomy ? ["Python"] : [],
                requiresConfirmation: fixture.requiresConfirmation,
              }),
            ]
          : [],
      );
      const results = await resolveApplicationQuestions({
        ai: fake.ai,
        correlationId: `matrix:${fixture.name}`,
        userId: "candidate-1",
        questions: fixture.questions,
        knowledge: fixture.knowledge,
        jobContext: { title: fixture.name },
      });
      const incorrect = results.filter(
        (item) => item.disposition === "AUTO_RESOLVED" && item.value == null,
      ).length;
      matrix.push({
        name: fixture.name,
        ordinaryTotal: results.length,
        deterministicAuto: results.filter(
          (item) =>
            item.disposition === "AUTO_RESOLVED" &&
            item.resolutionMetadata?.method !== "SEMANTIC_AI",
        ).length,
        semanticAuto: results.filter(
          (item) =>
            item.disposition === "AUTO_RESOLVED" &&
            item.resolutionMetadata?.method === "SEMANTIC_AI",
        ).length,
        proposal: results.filter(
          (item) => item.disposition === "PROPOSED_FOR_CANDIDATE",
        ).length,
        candidateRequired: results.filter(
          (item) => item.disposition === "CANDIDATE_REQUIRED",
        ).length,
        employerSite: results.filter(
          (item) => item.disposition === "HUMAN_REQUIRED",
        ).length,
        unsupported: results.filter(
          (item) => item.disposition === "UNSUPPORTED",
        ).length,
        incorrect,
      });
    }
    expect(matrix).toEqual([
      {
        name: "matching cybersecurity role",
        ordinaryTotal: 1,
        deterministicAuto: 1,
        semanticAuto: 0,
        proposal: 0,
        candidateRequired: 0,
        employerSite: 0,
        unsupported: 0,
        incorrect: 0,
      },
      {
        name: "deliberately mismatched sales role",
        ordinaryTotal: 1,
        deterministicAuto: 0,
        semanticAuto: 0,
        proposal: 0,
        candidateRequired: 1,
        employerSite: 0,
        unsupported: 0,
        incorrect: 0,
      },
      {
        name: "software terminology",
        ordinaryTotal: 1,
        deterministicAuto: 0,
        semanticAuto: 1,
        proposal: 0,
        candidateRequired: 0,
        employerSite: 0,
        unsupported: 0,
        incorrect: 0,
      },
      {
        name: "operations and business",
        ordinaryTotal: 1,
        deterministicAuto: 0,
        semanticAuto: 0,
        proposal: 1,
        candidateRequired: 0,
        employerSite: 0,
        unsupported: 0,
        incorrect: 0,
      },
      {
        name: "multilingual question",
        ordinaryTotal: 1,
        deterministicAuto: 0,
        semanticAuto: 1,
        proposal: 0,
        candidateRequired: 0,
        employerSite: 0,
        unsupported: 0,
        incorrect: 0,
      },
      {
        name: "unfamiliar paraphrase",
        ordinaryTotal: 1,
        deterministicAuto: 0,
        semanticAuto: 1,
        proposal: 0,
        candidateRequired: 0,
        employerSite: 0,
        unsupported: 0,
        incorrect: 0,
      },
      {
        name: "large choice taxonomy",
        ordinaryTotal: 1,
        deterministicAuto: 0,
        semanticAuto: 1,
        proposal: 0,
        candidateRequired: 0,
        employerSite: 0,
        unsupported: 0,
        incorrect: 0,
      },
      {
        name: "conflicting candidate evidence",
        ordinaryTotal: 1,
        deterministicAuto: 0,
        semanticAuto: 0,
        proposal: 0,
        candidateRequired: 1,
        employerSite: 0,
        unsupported: 0,
        incorrect: 0,
      },
      {
        name: "sparse resume",
        ordinaryTotal: 2,
        deterministicAuto: 0,
        semanticAuto: 0,
        proposal: 0,
        candidateRequired: 1,
        employerSite: 1,
        unsupported: 0,
        incorrect: 0,
      },
      {
        name: "complete history negative",
        ordinaryTotal: 1,
        deterministicAuto: 1,
        semanticAuto: 0,
        proposal: 0,
        candidateRequired: 0,
        employerSite: 0,
        unsupported: 0,
        incorrect: 0,
      },
    ]);
    expect(matrix.every((fixture) => fixture.incorrect === 0)).toBe(true);
    expect(
      matrix.reduce((sum, fixture) => sum + fixture.semanticAuto, 0),
    ).toBeGreaterThanOrEqual(4);
    expect(matrix.some((fixture) => fixture.proposal === 1)).toBe(true);
    expect(matrix.some((fixture) => fixture.candidateRequired > 0)).toBe(true);
    expect(matrix.some((fixture) => fixture.employerSite === 1)).toBe(true);
  });
});

describe("ordinary application intervention fixtures", () => {
  const preRp040ResidualBaseline = {
    totalEmployerSemanticDecisions: 7,
    automaticallyResolved: 0,
    oneClickProposals: 0,
    candidateEnteredAnswers: 7,
    employerSiteIrreducibleSteps: 0,
  };
  const currentLocation = knowledge("CURRENT_LOCATION", {
    text: "São Paulo, Brazil",
  });
  const notice = knowledge("NOTICE_PERIOD", { text: "30 days" });
  const cyberHistory = knowledge("EMPLOYMENT_HISTORY", {
    items: [
      {
        identity: "security-engineer",
        title: "Security Engineer",
        employer: "Example",
        startDate: "2022-01-01T00:00:00.000Z",
        endDate: "2025-01-01T00:00:00.000Z",
        description: "Python automation and cloud security engineering",
      },
    ],
  });

  it("reduces the mismatched sales fixture without manufacturing negative claims", async () => {
    const questions = [
      question("Country", {
        options: ["Brazil", "United States"],
        fieldTypes: ["multi_value_single_select"],
      }),
      question("Which country do you currently reside in?", {
        options: ["Brazil", "United States"],
        fieldTypes: ["multi_value_single_select"],
      }),
      question("Years of experience relevant to the position"),
      question(
        "Previous experience as an Account Executive or in a closing role?",
        {
          options: ["Yes", "No"],
          fieldTypes: ["input_radio"],
        },
      ),
      question("Existing/previous experience in B2B SaaS sales?", {
        options: ["Yes", "No"],
        fieldTypes: ["input_radio"],
      }),
      question("Expected annual base compensation (USD)"),
      noticeQuestion,
    ];
    const results = await resolveApplicationQuestions({
      correlationId: "sales-fixture",
      userId: "candidate-1",
      questions,
      knowledge: [
        currentLocation,
        notice,
        cyberHistory,
        knowledge("DESIRED_SALARY", {
          amount: 8_500,
          currency: "BRL",
          period: "monthly",
        }),
      ],
      jobContext: { title: "Account Executive", skills: ["B2B SaaS sales"] },
      now: new Date("2026-09-17T00:00:00.000Z"),
    });
    const metric = candidateInterventionMetric(results);
    expect(metric).toEqual({
      totalEmployerSemanticDecisions: 7,
      automaticallyResolved: 3,
      oneClickProposals: 0,
      candidateEnteredAnswers: 4,
      employerSiteIrreducibleSteps: 0,
    });
    expect(metric.candidateEnteredAnswers).toBeLessThan(
      preRp040ResidualBaseline.candidateEnteredAnswers,
    );
    expect(results[3]?.value).toBeNull();
    expect(results[4]?.value).toBeNull();
    expect(results[5]?.reasonCode).toBe("COMPENSATION_CURRENCY_MISMATCH");
  });

  it("uses explicit complete-history authority to close only bounded sales absences", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "sales-fixture-complete-history",
      userId: "candidate-1",
      questions: [
        question("Country", {
          options: ["Brazil", "United States"],
          fieldTypes: ["multi_value_single_select"],
        }),
        question("Which country do you currently reside in?", {
          options: ["Brazil", "United States"],
          fieldTypes: ["multi_value_single_select"],
        }),
        question("Years of experience relevant to the position"),
        question(
          "Previous experience as an Account Executive or in a closing role?",
          { options: ["Yes", "No"], fieldTypes: ["input_radio"] },
        ),
        question("Existing/previous experience in B2B SaaS sales?", {
          options: ["Yes", "No"],
          fieldTypes: ["input_radio"],
        }),
        question("Expected annual base compensation (USD)"),
        noticeQuestion,
      ],
      knowledge: [
        currentLocation,
        notice,
        cyberHistory,
        knowledge(
          "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
          { attested: true },
          {
            applicationUse: "PREFERENCE_CONTEXT_ONLY",
            autoAnswerAllowed: false,
          },
        ),
        knowledge(
          "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
          { authorized: true },
          {
            applicationUse: "PREFERENCE_CONTEXT_ONLY",
            autoAnswerAllowed: false,
          },
        ),
      ],
      jobContext: { title: "Account Executive", skills: ["B2B SaaS sales"] },
      now: new Date("2026-09-17T00:00:00.000Z"),
    });
    expect(candidateInterventionMetric(results)).toEqual({
      totalEmployerSemanticDecisions: 7,
      automaticallyResolved: 6,
      oneClickProposals: 0,
      candidateEnteredAnswers: 1,
      employerSiteIrreducibleSteps: 0,
    });
    expect(results[2]).toMatchObject({
      value: "0 years",
      reasonCode: "COMPLETE_HISTORY_SUPPORTS_ZERO_EXPERIENCE",
    });
    expect(results[3]).toMatchObject({
      value: "No",
      reasonCode: "COMPLETE_HISTORY_SUPPORTS_NO_EXPERIENCE",
    });
    expect(results[4]).toMatchObject({
      value: "No",
      reasonCode: "COMPLETE_HISTORY_SUPPORTS_NO_EXPERIENCE",
    });
  });

  it("removes materially more work for a matching security application", async () => {
    const results = await resolveApplicationQuestions({
      correlationId: "security-fixture",
      userId: "candidate-1",
      questions: [
        question("Country of residence", {
          options: ["Brazil", "United States"],
          fieldTypes: ["multi_value_single_select"],
        }),
        question("English proficiency", {
          options: ["Basic", "Professional fluent"],
          fieldTypes: ["multi_value_single_select"],
        }),
        noticeQuestion,
        question("Years of cybersecurity experience"),
        question("Do you have Python experience?", {
          options: ["Yes", "No"],
          fieldTypes: ["input_radio"],
        }),
        question("Do you have cloud-security experience?", {
          options: ["Yes", "No"],
          fieldTypes: ["input_radio"],
        }),
        question("Desired annual salary (USD)"),
      ],
      knowledge: [
        currentLocation,
        notice,
        cyberHistory,
        knowledge("LANGUAGE_PROFICIENCY:english", {
          proficiency: "Professional fluent",
        }),
        knowledge("DESIRED_SALARY", {
          amount: 96_000,
          currency: "USD",
          period: "annual",
        }),
      ],
      jobContext: {
        title: "Security Engineer",
        skills: ["Python", "cloud security"],
      },
      now: new Date("2026-09-17T00:00:00.000Z"),
    });
    const metric = candidateInterventionMetric(results);
    expect(metric).toEqual({
      totalEmployerSemanticDecisions: 7,
      automaticallyResolved: 7,
      oneClickProposals: 0,
      candidateEnteredAnswers: 0,
      employerSiteIrreducibleSteps: 0,
    });
    expect(metric.automaticallyResolved).toBeGreaterThan(
      preRp040ResidualBaseline.automaticallyResolved,
    );
  });

  it("stops closed-world negatives after authority invalidation while preserving positives", async () => {
    const questions = [
      question("Previous experience as an Account Executive?", {
        options: ["Yes", "No"],
        fieldTypes: ["input_radio"],
      }),
      question("Do you have Python experience?", {
        options: ["Yes", "No"],
        fieldTypes: ["input_radio"],
      }),
    ];
    const authorities = [
      knowledge(
        "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
        { attested: true },
        {
          applicationUse: "PREFERENCE_CONTEXT_ONLY",
          autoAnswerAllowed: false,
        },
      ),
      knowledge(
        "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
        { authorized: true },
        {
          applicationUse: "PREFERENCE_CONTEXT_ONLY",
          autoAnswerAllowed: false,
        },
      ),
    ];
    const before = await resolveApplicationQuestions({
      correlationId: "authority-before-history-change",
      userId: "candidate-1",
      questions,
      knowledge: [cyberHistory, ...authorities],
    });
    const after = await resolveApplicationQuestions({
      correlationId: "authority-after-history-change",
      userId: "candidate-1",
      questions,
      knowledge: [cyberHistory],
    });
    expect(candidateInterventionMetric(before)).toEqual({
      totalEmployerSemanticDecisions: 2,
      automaticallyResolved: 2,
      oneClickProposals: 0,
      candidateEnteredAnswers: 0,
      employerSiteIrreducibleSteps: 0,
    });
    expect(candidateInterventionMetric(after)).toEqual({
      totalEmployerSemanticDecisions: 2,
      automaticallyResolved: 1,
      oneClickProposals: 0,
      candidateEnteredAnswers: 1,
      employerSiteIrreducibleSteps: 0,
    });
    expect(after[0]).toMatchObject({
      disposition: "CANDIDATE_REQUIRED",
      value: null,
    });
    expect(after[1]).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "Yes",
    });
  });
});
