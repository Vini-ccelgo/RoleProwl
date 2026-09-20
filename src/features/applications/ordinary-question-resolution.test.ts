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
