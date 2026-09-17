import { describe, expect, it } from "vitest";
import type {
  CandidateKnowledgeConcept,
  CandidateKnowledgeQueryResult,
} from "@/core/domain/candidate/candidate-knowledge";
import type { ResolvableApplicationQuestion } from "@/core/domain/applications/application-question-resolution";
import {
  convertCompensationBasis,
  resolveExperienceContextualQuestion,
  resolveKnownContextualQuestion,
} from "./resolve-contextual-question";

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
    provenance: { source: "PROFILE", sourceId: "candidate-1" },
    reusable: true,
    status: "AVAILABLE",
    value,
    ...overrides,
  };
}

function knowledgeMap(...items: CandidateKnowledgeQueryResult[]) {
  return new Map(items.map((item) => [item.concept, item]));
}

describe("known contextual application questions", () => {
  it("answers a clear residence-country question from explicit current location", () => {
    const result = resolveKnownContextualQuestion({
      question: question("Which country do you currently reside in?", {
        fieldTypes: ["multi_value_single_select"],
        options: ["Brazil", "United States"],
        optionIdentities: [
          { label: "Brazil", value: "br-raw" },
          { label: "United States", value: "us-raw" },
        ],
      }),
      knowledge: knowledgeMap(
        knowledge("CURRENT_LOCATION", { text: "São Paulo, Brazil" }),
      ),
    });
    expect(result?.resolution).toMatchObject({
      canonicalConcept: "CURRENT_LOCATION",
      disposition: "AUTO_RESOLVED",
      value: "br-raw",
      reasonCode: "EXPLICIT_CURRENT_RESIDENCE",
    });
  });

  it("adapts an explicit profile ISO country without a fixture-specific country list", () => {
    const result = resolveKnownContextualQuestion({
      question: question("Country of residence", {
        fieldTypes: ["multi_value_single_select"],
        options: ["Germany", "Brazil"],
        optionIdentities: [
          { label: "Germany", value: "de-raw" },
          { label: "Brazil", value: "br-raw" },
        ],
      }),
      knowledge: knowledgeMap(
        knowledge("CURRENT_LOCATION", {
          text: "Berlin",
          countryCode: "DE",
        }),
      ),
    });
    expect(result?.resolution).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "de-raw",
      reasonCode: "EXPLICIT_CURRENT_RESIDENCE",
    });
  });

  it("does not treat nationality or a historical résumé location as current residence", () => {
    const residence = question("Country of residence");
    const missing = resolveKnownContextualQuestion({
      question: residence,
      knowledge: knowledgeMap(
        knowledge("REUSABLE_SELF_DESCRIPTION", {
          text: "Brazilian nationality",
        }),
      ),
    });
    const resumeOnly = resolveKnownContextualQuestion({
      question: residence,
      knowledge: knowledgeMap(
        knowledge(
          "CURRENT_LOCATION",
          { text: "Rio de Janeiro, Brazil" },
          { provenance: { source: "RESUME", sourceId: "historical-location" } },
        ),
      ),
    });
    expect(missing?.resolution?.reasonCode).toBe("CURRENT_RESIDENCE_MISSING");
    expect(resumeOnly?.resolution?.reasonCode).toBe(
      "CURRENT_RESIDENCE_NOT_EXPLICIT",
    );
  });

  it("keeps an ambiguous generic Country field candidate-controlled", () => {
    const result = resolveKnownContextualQuestion({
      question: question("Country", {
        fieldTypes: ["multi_value_single_select"],
        options: ["Brazil", "United States"],
      }),
      knowledge: knowledgeMap(
        knowledge("CURRENT_LOCATION", { text: "São Paulo, Brazil" }),
      ),
    });
    expect(result?.resolution).toMatchObject({
      disposition: "PROPOSED_FOR_CANDIDATE",
      value: "Brazil",
      reasonCode: "AMBIGUOUS_COUNTRY_APPROVAL_REQUIRED",
    });
  });

  it("converts same-currency monthly and annual compensation by code", () => {
    expect(
      convertCompensationBasis(
        { amount: 6_500, currency: "BRL", period: "monthly" },
        "annual",
      ),
    ).toEqual({ amount: 78_000, currency: "BRL", period: "annual" });
    expect(
      convertCompensationBasis(
        { amount: 78_000, currency: "BRL", period: "annual" },
        "monthly",
      ),
    ).toEqual({ amount: 6_500, currency: "BRL", period: "monthly" });
  });

  it("resolves only semantically compatible desired compensation", () => {
    const expectedAnnual = question("Expected annual base compensation (USD)");
    const resolved = resolveKnownContextualQuestion({
      question: expectedAnnual,
      knowledge: knowledgeMap(
        knowledge("DESIRED_SALARY", {
          amount: 8_000,
          currency: "USD",
          period: "monthly",
        }),
      ),
    });
    const wrongConcept = resolveKnownContextualQuestion({
      question: expectedAnnual,
      knowledge: knowledgeMap(
        knowledge("CURRENT_COMPENSATION", {
          amount: 8_000,
          currency: "USD",
          period: "monthly",
        }),
      ),
    });
    const wrongCurrency = resolveKnownContextualQuestion({
      question: expectedAnnual,
      knowledge: knowledgeMap(
        knowledge("DESIRED_SALARY", {
          amount: 8_500,
          currency: "BRL",
          period: "monthly",
        }),
      ),
    });
    expect(resolved?.resolution).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "96000",
      reasonCode: "SAME_CURRENCY_BASIS_CONVERSION",
    });
    expect(wrongConcept?.resolution?.reasonCode).toBe(
      "CANDIDATE_KNOWLEDGE_MISSING",
    );
    expect(wrongCurrency?.resolution?.reasonCode).toBe(
      "COMPENSATION_CURRENCY_MISMATCH",
    );
  });
});

describe("experience-contextual application questions", () => {
  const employment = knowledge("EMPLOYMENT_HISTORY", {
    items: [
      {
        identity: "security-analyst",
        title: "Security Analyst",
        employer: "Example One",
        startDate: "2022-01-01T00:00:00.000Z",
        endDate: "2024-01-01T00:00:00.000Z",
        description: "Python detection automation and cloud security",
      },
      {
        identity: "security-engineer",
        title: "Security Engineer",
        employer: "Example Two",
        startDate: "2023-01-01T00:00:00.000Z",
        endDate: "2025-01-01T00:00:00.000Z",
        description: "Cloud security engineering",
      },
    ],
  });

  it("computes contextual duration from selected dated evidence and unions overlap", () => {
    const result = resolveExperienceContextualQuestion({
      question: question(
        "How many years of experience are relevant to this position?",
      ),
      knowledge: knowledgeMap(employment),
      jobContext: { title: "Senior Security Engineer", skills: ["security"] },
      now: new Date("2026-09-17T00:00:00.000Z"),
    });
    expect(result?.resolution).toMatchObject({
      disposition: "PROPOSED_FOR_CANDIDATE",
      value: "3 years",
      reasonCode: "CONTEXTUAL_EXPERIENCE_DURATION_APPROVAL_REQUIRED",
    });
    expect(result?.resolution?.candidateKnowledgeReferences).toEqual([
      "EXPERIENCE:security-analyst",
      "EXPERIENCE:security-engineer",
    ]);
  });

  it("uses explicit evidence to establish Yes but never derives No from absence", () => {
    const python = resolveExperienceContextualQuestion({
      question: question("Do you have Python experience?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
        optionIdentities: [
          { label: "Yes", value: "yes-raw" },
          { label: "No", value: "no-raw" },
        ],
      }),
      knowledge: knowledgeMap(employment),
    });
    const accountExecutive = resolveExperienceContextualQuestion({
      question: question("Previous experience as an Account Executive?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
      }),
      knowledge: knowledgeMap(employment),
    });
    expect(python?.resolution).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "yes-raw",
      reasonCode: "EXPLICIT_EXPERIENCE_SUPPORTS_YES",
    });
    expect(accountExecutive?.resolution).toBeNull();
    expect(accountExecutive?.aiQuestion?.kind).toBe("EXPERIENCE_PREDICATE");
  });

  it("establishes explicit B2B SaaS support without employer-specific hardcoding", () => {
    const result = resolveExperienceContextualQuestion({
      question: question("Existing experience in B2B SaaS sales?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
      }),
      knowledge: knowledgeMap(
        knowledge("EMPLOYMENT_HISTORY", {
          items: [
            {
              identity: "saas-ae",
              title: "Account Executive",
              employer: "SaaSCo",
              startDate: "2023-01-01T00:00:00.000Z",
              endDate: "2025-01-01T00:00:00.000Z",
              description: "B2B SaaS sales to enterprise customers",
            },
          ],
        }),
      ),
    });
    expect(result?.resolution).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "Yes",
    });
  });

  it("can use an approved explicit skill without requiring employment history", () => {
    const result = resolveExperienceContextualQuestion({
      question: question("Do you have Python experience?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
      }),
      knowledge: knowledgeMap(
        knowledge("SKILLS", {
          items: [{ identity: "python", text: "Python" }],
        }),
      ),
    });
    expect(result?.resolution).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "Yes",
      candidateKnowledgeReferences: ["SKILL:python"],
    });
  });

  it("can use an accepted candidate fact as bounded positive evidence", () => {
    const result = resolveExperienceContextualQuestion({
      question: question("Previous experience as an Account Executive?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
      }),
      knowledge: knowledgeMap(
        knowledge(
          "EMPLOYMENT_HISTORY",
          { text: "Account Executive selling enterprise software" },
          {
            provenance: { source: "RESUME", sourceId: "accepted-fact-1" },
          },
        ),
      ),
    });
    expect(result?.resolution).toMatchObject({
      disposition: "AUTO_RESOLVED",
      value: "Yes",
      candidateKnowledgeReferences: ["EXPERIENCE:accepted-fact-1"],
    });
  });

  it("requires confirmation when explicit supporting evidence is not auto-answerable", () => {
    const result = resolveExperienceContextualQuestion({
      question: question("Do you have Python experience?", {
        fieldTypes: ["input_radio"],
        options: ["Yes", "No"],
      }),
      knowledge: knowledgeMap(
        knowledge(
          "SKILLS",
          { items: [{ identity: "python", text: "Python" }] },
          { autoAnswerAllowed: false },
        ),
      ),
    });
    expect(result?.resolution).toMatchObject({
      disposition: "PROPOSED_FOR_CANDIDATE",
      value: "Yes",
      reasonCode: "SEMANTIC_EXPERIENCE_SUPPORTS_YES_APPROVAL_REQUIRED",
    });
  });
});
