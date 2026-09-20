import type {
  CandidateKnowledgeConcept,
  CandidateKnowledgeQueryResult,
} from "@/core/domain/candidate/candidate-knowledge";
import { countryCodesExplicitlyNamed } from "@/core/domain/candidate/candidate-knowledge";
import type {
  ApplicationQuestionResolution,
  ResolvableApplicationQuestion,
} from "@/core/domain/applications/application-question-resolution";
import {
  adaptExperienceDurationToEmployerControl,
  adaptKnownValueToEmployerControl,
} from "@/core/domain/applications/control-adaptation";
import { normalizedChoiceText } from "@/core/domain/applications/choice-taxonomy";
import {
  unionExperienceDurationMonths,
  type DatedExperienceInterval,
} from "@/core/domain/applications/experience-duration";

export interface ApplicationJobContext {
  readonly title: string;
  readonly requirements?: unknown;
  readonly preferredRequirements?: unknown;
  readonly skills?: unknown;
  readonly salaryMin?: number | null;
  readonly salaryMax?: number | null;
  readonly salaryCurrency?: string | null;
  readonly salaryInterval?: string | null;
}

export interface ContextualEvidence {
  readonly id: string;
  readonly type: "EXPERIENCE" | "SKILL" | "PROJECT" | "CERTIFICATION";
  readonly summary: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly isCurrent?: boolean;
  readonly autoResolve: boolean;
}

export interface ContextualAIQuestion {
  readonly kind: "RELEVANT_EXPERIENCE" | "EXPERIENCE_PREDICATE";
  readonly proposition: string;
  readonly evidence: readonly ContextualEvidence[];
}

export interface ContextualQuestionResult {
  readonly resolution: ApplicationQuestionResolution | null;
  readonly aiQuestion?: ContextualAIQuestion;
}

function referenceId(result: CandidateKnowledgeQueryResult) {
  return `${result.concept}:${result.provenance?.source ?? "UNKNOWN"}:${result.provenance?.sourceId ?? "NONE"}`;
}

function canAutoResolve(result: CandidateKnowledgeQueryResult) {
  return (
    result.status === "AVAILABLE" &&
    !result.conflict &&
    result.freshness !== "STALE" &&
    result.candidateApproved &&
    result.reusable &&
    result.autoAnswerAllowed &&
    result.applicationUse === "REUSABLE_ANSWER"
  );
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => (string(item) ? [string(item)!] : []))
    : [];
}

function collectionItems(result: CandidateKnowledgeQueryResult | undefined) {
  if (Array.isArray(result?.value?.items))
    return result.value.items.flatMap((item) =>
      record(item) ? [record(item)!] : [],
    );
  const value = record(result?.value);
  return value && string(value.text)
    ? [
        {
          ...value,
          identity: string(value.identity) ?? result?.provenance?.sourceId,
        },
      ]
    : [];
}

const COUNTRY_NAMES: Readonly<Record<string, readonly string[]>> = {
  BR: ["Brazil", "Brasil", "BR"],
  US: ["United States", "United States of America", "USA", "US"],
};

function regionDisplayName(countryCode: string, locale: string) {
  try {
    const displayed = new Intl.DisplayNames([locale], { type: "region" }).of(
      countryCode,
    );
    return displayed && displayed !== countryCode ? displayed : null;
  } catch {
    return null;
  }
}

function countryNames(countryCode: string) {
  return [
    ...(COUNTRY_NAMES[countryCode] ?? []),
    regionDisplayName(countryCode, "en"),
    regionDisplayName(countryCode, "pt-BR"),
    countryCode,
  ].filter((value, index, values): value is string =>
    Boolean(value && values.indexOf(value) === index),
  );
}

const BRAZIL_SUBDIVISIONS = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

function explicitResidenceCountry(location: string) {
  const codes = countryCodesExplicitlyNamed(location);
  if (codes.length === 1) return codes[0]!;
  const subdivision = location.normalize("NFKC").match(/,\s*([A-Z]{2})$/u)?.[1];
  return subdivision && BRAZIL_SUBDIVISIONS.has(subdivision) ? "BR" : null;
}

function currentLocationText(result: CandidateKnowledgeQueryResult) {
  const value = result.value;
  if (!value) return null;
  return string(value.text) ?? string(value.value);
}

function currentLocationCountryCode(result: CandidateKnowledgeQueryResult) {
  const value = result.value;
  const countryCode = string(value?.countryCode)?.toUpperCase();
  if (countryCode && /^[A-Z]{2}$/u.test(countryCode)) return countryCode;
  const location = currentLocationText(result);
  return location ? explicitResidenceCountry(location) : null;
}

function residenceQuestionKind(question: ResolvableApplicationQuestion) {
  const label = normalizedChoiceText(question.label);
  const fields = question.fieldNames.map(normalizedChoiceText).join(" ");
  const mentionsCountry = /\b(?:country|pais)\b/u.test(`${label} ${fields}`);
  if (!mentionsCountry) return null;
  if (
    /\b(?:reside|residence|resident|current address|currently live|currently reside|pais de residencia|residencia atual)\b/u.test(
      `${label} ${fields}`,
    ) ||
    /\b(?:residence|address|current)[ _-]?country\b/u.test(
      question.fieldNames.join(" "),
    )
  )
    return "CLEAR" as const;
  return /^(?:country|pais)$/u.test(label) ? ("AMBIGUOUS" as const) : null;
}

function sameFormResidenceContext(input: {
  readonly question: ResolvableApplicationQuestion;
  readonly questions: readonly ResolvableApplicationQuestion[];
}) {
  if (residenceQuestionKind(input.question) !== "AMBIGUOUS") return false;
  const otherQuestions = input.questions.filter(
    (question) => question.id !== input.question.id,
  );
  const explicitResidence = otherQuestions.some(
    (question) => residenceQuestionKind(question) === "CLEAR",
  );
  if (!explicitResidence) return false;
  const competingSemantics = otherQuestions.some((question) => {
    const value = normalizedChoiceText(
      `${question.label} ${question.fieldNames.join(" ")}`,
    );
    if (
      /\b(?:citizenship|citizen|nationality|tax residence|tax residency|office location|office country|country of employment|cidadania|nacionalidade|residencia fiscal)\b/u.test(
        value,
      )
    )
      return true;
    const jurisdictionSensitive =
      /\b(?:work authorization|authorized to work|sponsorship|sponsor|autorizacao para trabalhar|patrocinio)\b/u.test(
        value,
      );
    if (!jurisdictionSensitive) return false;
    const explicitlySelectsJurisdiction =
      /\b(?:country|countries|jurisdiction|location|where|which country|pais|paises|jurisdicao|localizacao)\b/u.test(
        value,
      ) ||
      question.options.some(
        (option) => countryCodesExplicitlyNamed(option).length > 0,
      );
    return explicitlySelectsJurisdiction;
  });
  return !competingSemantics;
}

function unavailableResolution(input: {
  question: ResolvableApplicationQuestion;
  concept: CandidateKnowledgeConcept | null;
  reasonCode: string;
  references?: readonly string[];
}) {
  return {
    questionId: input.question.id,
    canonicalConcept: input.concept,
    disposition: "CANDIDATE_REQUIRED" as const,
    value: null,
    candidateKnowledgeReferences: input.references ?? [],
    reasonCode: input.reasonCode,
  };
}

function resolveResidence(input: {
  question: ResolvableApplicationQuestion;
  questions: readonly ResolvableApplicationQuestion[];
  knowledge: ReadonlyMap<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >;
}): ContextualQuestionResult | null {
  const kind = residenceQuestionKind(input.question);
  if (!kind) return null;
  const supportedBySameForm = sameFormResidenceContext(input);
  if (kind === "AMBIGUOUS" && !supportedBySameForm)
    return {
      resolution: unavailableResolution({
        question: input.question,
        concept: "CURRENT_LOCATION",
        reasonCode: "AMBIGUOUS_COUNTRY_CONTEXT_REQUIRED",
      }),
    };
  const candidate = input.knowledge.get("CURRENT_LOCATION");
  if (!candidate || candidate.status === "MISSING")
    return {
      resolution: unavailableResolution({
        question: input.question,
        concept: "CURRENT_LOCATION",
        reasonCode: "CURRENT_RESIDENCE_MISSING",
      }),
    };
  const references = [referenceId(candidate)];
  if (
    candidate.conflict ||
    candidate.status === "STALE_CONFIRMATION_REQUIRED" ||
    candidate.freshness === "STALE"
  )
    return {
      resolution: unavailableResolution({
        question: input.question,
        concept: "CURRENT_LOCATION",
        references,
        reasonCode: candidate.conflict
          ? "CANDIDATE_KNOWLEDGE_CONFLICT"
          : "CANDIDATE_KNOWLEDGE_STALE",
      }),
    };
  if (candidate.provenance?.source === "RESUME")
    return {
      resolution: unavailableResolution({
        question: input.question,
        concept: "CURRENT_LOCATION",
        references,
        reasonCode: "CURRENT_RESIDENCE_NOT_EXPLICIT",
      }),
    };
  const countryCode = currentLocationCountryCode(candidate);
  const names = countryCode ? countryNames(countryCode) : [];
  if (!names.length)
    return {
      resolution: unavailableResolution({
        question: input.question,
        concept: "CURRENT_LOCATION",
        references,
        reasonCode: "CURRENT_RESIDENCE_COUNTRY_NOT_ESTABLISHED",
      }),
    };
  const value = names
    .map((name) => adaptKnownValueToEmployerControl(name, input.question))
    .find(Boolean);
  if (!value)
    return {
      resolution: unavailableResolution({
        question: input.question,
        concept: "CURRENT_LOCATION",
        references,
        reasonCode: "FIELD_TAXONOMY_MISMATCH",
      }),
    };
  const auto =
    (kind === "CLEAR" || supportedBySameForm) && canAutoResolve(candidate);
  return {
    resolution: {
      questionId: input.question.id,
      canonicalConcept: "CURRENT_LOCATION",
      disposition: auto ? "AUTO_RESOLVED" : "PROPOSED_FOR_CANDIDATE",
      value,
      candidateKnowledgeReferences: references,
      reasonCode: auto
        ? supportedBySameForm
          ? "SAME_FORM_CURRENT_RESIDENCE_CONTEXT"
          : "EXPLICIT_CURRENT_RESIDENCE"
        : "CURRENT_RESIDENCE_APPROVAL_REQUIRED",
    },
  };
}

export interface CompensationValue {
  readonly amount: number;
  readonly currency: string;
  readonly period: "annual" | "monthly";
}

function compensationValue(result: CandidateKnowledgeQueryResult) {
  const outer = result.value;
  const value = record(outer?.value) ?? outer;
  if (!value) return null;
  const amount =
    typeof value.amount === "number"
      ? value.amount
      : typeof value.amount === "string"
        ? Number(value.amount.replaceAll(",", ""))
        : NaN;
  const currency = string(value.currency)?.toUpperCase();
  const rawPeriod = normalizedChoiceText(string(value.period) ?? "");
  const period = /\b(?:annual|annually|year|yearly|ano|anual)\b/u.test(
    rawPeriod,
  )
    ? ("annual" as const)
    : /\b(?:month|monthly|mes|mensal)\b/u.test(rawPeriod)
      ? ("monthly" as const)
      : null;
  return Number.isFinite(amount) && amount >= 0 && currency && period
    ? { amount, currency, period }
    : null;
}

export function convertCompensationBasis(
  value: CompensationValue,
  target: CompensationValue["period"],
): CompensationValue {
  if (value.period === target) return value;
  return {
    ...value,
    amount: target === "annual" ? value.amount * 12 : value.amount / 12,
    period: target,
  };
}

function compensationSemantics(question: ResolvableApplicationQuestion) {
  const rawValue = `${question.label} ${question.fieldNames.join(" ")}`;
  const value = normalizedChoiceText(rawValue);
  const concept =
    /\b(?:desired|expected|expectations?|target|pretensao)\b/u.test(value)
      ? ("DESIRED_SALARY" as const)
      : /\b(?:current|atual)\b/u.test(value)
        ? ("CURRENT_COMPENSATION" as const)
        : null;
  if (
    !concept ||
    !/\b(?:salary|compensation|pay|remuneracao|salario)\b/u.test(value)
  )
    return null;
  const currency = /\b(?:usd|us dollar|dollars?)\b/u.test(value)
    ? "USD"
    : /\b(?:brl|real|reais)\b/u.test(value) || /r\$/iu.test(rawValue)
      ? "BRL"
      : /\b(?:eur|euro|euros)\b/u.test(value)
        ? "EUR"
        : null;
  const period = /\b(?:annual|annually|year|yearly|ano|anual)\b/u.test(value)
    ? ("annual" as const)
    : /\b(?:month|monthly|mes|mensal)\b/u.test(value)
      ? ("monthly" as const)
      : null;
  return { concept, currency, period };
}

function formattedAmount(amount: number) {
  return Number.isInteger(amount)
    ? String(amount)
    : String(Number(amount.toFixed(2)));
}

function resolveCompensation(input: {
  question: ResolvableApplicationQuestion;
  jobContext?: ApplicationJobContext;
  knowledge: ReadonlyMap<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >;
}): ContextualQuestionResult | null {
  const semantics = compensationSemantics(input.question);
  if (!semantics) return null;
  const candidate = input.knowledge.get(semantics.concept);
  const postedCurrency =
    input.jobContext?.salaryCurrency?.toUpperCase() ?? null;
  const postedPeriodText = normalizedChoiceText(
    input.jobContext?.salaryInterval ?? "",
  );
  const postedPeriod = /\b(?:annual|annually|year|yearly|ano|anual)\b/u.test(
    postedPeriodText,
  )
    ? ("annual" as const)
    : /\b(?:month|monthly|mes|mensal)\b/u.test(postedPeriodText)
      ? ("monthly" as const)
      : null;
  const postedMaximum = input.jobContext?.salaryMax ?? null;
  const postedMinimum = input.jobContext?.salaryMin ?? null;
  const postedRecommendation =
    semantics.concept === "DESIRED_SALARY" &&
    postedMinimum != null &&
    postedMaximum != null &&
    Number.isFinite(postedMinimum) &&
    Number.isFinite(postedMaximum) &&
    postedMinimum >= 0 &&
    postedMaximum >= 0 &&
    postedMinimum <= postedMaximum &&
    postedCurrency &&
    postedPeriod &&
    (!semantics.currency || semantics.currency === postedCurrency) &&
    (!semantics.period || semantics.period === postedPeriod)
      ? {
          amount: postedMaximum,
          currency: postedCurrency,
          period: postedPeriod,
        }
      : null;
  const postedValue = postedRecommendation
    ? input.question.options.length
      ? [
          formattedAmount(postedRecommendation.amount),
          `${postedRecommendation.currency} ${formattedAmount(postedRecommendation.amount)}`,
        ]
          .map((value) =>
            adaptKnownValueToEmployerControl(value, input.question),
          )
          .find(Boolean)
      : formattedAmount(postedRecommendation.amount)
    : null;
  if (!candidate || candidate.status === "MISSING")
    return {
      resolution: postedValue
        ? {
            questionId: input.question.id,
            canonicalConcept: semantics.concept,
            disposition: "PROPOSED_FOR_CANDIDATE",
            value: postedValue,
            candidateKnowledgeReferences: [],
            reasonCode: "EMPLOYER_POSTED_COMPENSATION_PROPOSAL",
          }
        : unavailableResolution({
            question: input.question,
            concept: semantics.concept,
            reasonCode: "CANDIDATE_KNOWLEDGE_MISSING",
          }),
    };
  const references = [referenceId(candidate)];
  if (
    candidate.conflict ||
    candidate.status === "STALE_CONFIRMATION_REQUIRED" ||
    candidate.freshness === "STALE"
  )
    return {
      resolution: unavailableResolution({
        question: input.question,
        concept: semantics.concept,
        references,
        reasonCode: candidate.conflict
          ? "CANDIDATE_KNOWLEDGE_CONFLICT"
          : "CANDIDATE_KNOWLEDGE_STALE",
      }),
    };
  const known = compensationValue(candidate);
  if (!known)
    return {
      resolution: postedValue
        ? {
            questionId: input.question.id,
            canonicalConcept: semantics.concept,
            disposition: "PROPOSED_FOR_CANDIDATE",
            value: postedValue,
            candidateKnowledgeReferences: references,
            reasonCode: "EMPLOYER_POSTED_COMPENSATION_PROPOSAL",
          }
        : unavailableResolution({
            question: input.question,
            concept: semantics.concept,
            references,
            reasonCode: "COMPENSATION_NOT_STRUCTURED",
          }),
    };
  if (semantics.currency && semantics.currency !== known.currency)
    return {
      resolution: postedValue
        ? {
            questionId: input.question.id,
            canonicalConcept: semantics.concept,
            disposition: "PROPOSED_FOR_CANDIDATE",
            value: postedValue,
            candidateKnowledgeReferences: references,
            reasonCode: "EMPLOYER_POSTED_COMPENSATION_PROPOSAL",
          }
        : unavailableResolution({
            question: input.question,
            concept: semantics.concept,
            references,
            reasonCode: "COMPENSATION_CURRENCY_MISMATCH",
          }),
    };
  const converted = semantics.period
    ? convertCompensationBasis(known, semantics.period)
    : known;
  const amount = formattedAmount(converted.amount);
  const candidates = [
    amount,
    `${converted.currency} ${amount}`,
    `${converted.currency} ${amount} ${converted.period}`,
  ];
  const value = input.question.options.length
    ? candidates
        .map((candidate) =>
          adaptKnownValueToEmployerControl(candidate, input.question),
        )
        .find(Boolean)
    : semantics.currency || semantics.period
      ? amount
      : `${converted.currency} ${amount} ${converted.period}`;
  if (!value)
    return {
      resolution: unavailableResolution({
        question: input.question,
        concept: semantics.concept,
        references,
        reasonCode: "FIELD_TAXONOMY_MISMATCH",
      }),
    };
  const auto = canAutoResolve(candidate);
  return {
    resolution: {
      questionId: input.question.id,
      canonicalConcept: semantics.concept,
      disposition: auto ? "AUTO_RESOLVED" : "PROPOSED_FOR_CANDIDATE",
      value,
      candidateKnowledgeReferences: references,
      reasonCode:
        known.period === converted.period
          ? auto
            ? "EXACT_COMPENSATION_MATCH"
            : "COMPENSATION_APPROVAL_REQUIRED"
          : auto
            ? "SAME_CURRENCY_BASIS_CONVERSION"
            : "COMPENSATION_CONVERSION_APPROVAL_REQUIRED",
    },
  };
}

export function resolveKnownContextualQuestion(input: {
  readonly question: ResolvableApplicationQuestion;
  readonly questions?: readonly ResolvableApplicationQuestion[];
  readonly jobContext?: ApplicationJobContext;
  readonly knowledge: ReadonlyMap<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >;
}): ContextualQuestionResult | null {
  return (
    resolveResidence({
      ...input,
      questions: input.questions ?? [input.question],
    }) ?? resolveCompensation(input)
  );
}

function evidenceId(
  type: ContextualEvidence["type"],
  item: Readonly<Record<string, unknown>>,
) {
  const identity = string(item.identity);
  return identity ? `${type}:${identity}` : null;
}

function evidenceSummary(item: Readonly<Record<string, unknown>>) {
  return [
    string(item.title),
    string(item.employer),
    string(item.text),
    string(item.description),
    ...stringArray(item.responsibilities),
    ...stringArray(item.achievements),
  ]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 700);
}

export function contextualCandidateEvidence(
  knowledge: ReadonlyMap<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >,
) {
  const sources = [
    ["EMPLOYMENT_HISTORY", "EXPERIENCE"],
    ["SKILLS", "SKILL"],
    ["PROJECTS", "PROJECT"],
    ["CERTIFICATIONS", "CERTIFICATION"],
  ] as const;
  return sources.flatMap(([concept, type]) => {
    const result = knowledge.get(concept);
    if (
      !result ||
      result.status !== "AVAILABLE" ||
      result.conflict ||
      result.freshness === "STALE" ||
      !result.candidateApproved
    )
      return [];
    return collectionItems(result).flatMap((item) => {
      const summary = evidenceSummary(item);
      const id = evidenceId(type, item);
      if (!summary || !id) return [];
      return [
        {
          id,
          type,
          summary,
          autoResolve: canAutoResolve(result),
          ...(string(item.startDate)
            ? { startDate: string(item.startDate)! }
            : {}),
          ...(string(item.endDate) ? { endDate: string(item.endDate)! } : {}),
          ...(typeof item.isCurrent === "boolean"
            ? { isCurrent: item.isCurrent }
            : {}),
        } satisfies ContextualEvidence,
      ];
    });
  });
}

function relevantExperienceQuestion(question: ResolvableApplicationQuestion) {
  const value = normalizedChoiceText(question.label);
  return (
    /\b(?:year|years|anos?)\b/u.test(value) &&
    /\b(?:experience|experiencia)\b/u.test(value)
  );
}

function experiencePredicateQuestion(question: ResolvableApplicationQuestion) {
  const value = normalizedChoiceText(question.label);
  const optionLabels = question.options.map(normalizedChoiceText);
  const booleanControl =
    optionLabels.some((label) => /^(?:yes|sim)\b/u.test(label)) &&
    optionLabels.some((label) => /^(?:no|nao)\b/u.test(label));
  return (
    !relevantExperienceQuestion(question) &&
    /\b(?:experience|worked|work as|managed|manage|experiencia|trabalhou|gerenciou)\b/u.test(
      value,
    ) &&
    (booleanControl ||
      /^(?:do|have|has|did|are|can|possui|tem|voce|ja|previous|existing)/u.test(
        value,
      ))
  );
}

const TERM_STOPWORDS = new Set([
  "account",
  "anos",
  "cargo",
  "current",
  "experience",
  "experiencia",
  "have",
  "position",
  "previous",
  "relevant",
  "role",
  "the",
  "this",
  "vaga",
  "with",
  "worked",
  "years",
  "your",
]);

function terms(value: string) {
  return [
    ...new Set(
      normalizedChoiceText(value)
        .split(" ")
        .map((term) =>
          term === "cybersecurity" || term === "cyber" ? "security" : term,
        )
        .filter((term) => term.length >= 3 && !TERM_STOPWORDS.has(term)),
    ),
  ];
}

function boundedJobStrings(value: unknown): string[] {
  if (typeof value === "string")
    return value.trim() ? [value.trim().slice(0, 500)] : [];
  if (Array.isArray(value))
    return value.flatMap(boundedJobStrings).slice(0, 20);
  const item = record(value);
  return item
    ? Object.values(item).flatMap(boundedJobStrings).slice(0, 20)
    : [];
}

export function minimizedApplicationJobContext(
  context: ApplicationJobContext | undefined,
) {
  if (!context) return null;
  return {
    title: context.title.slice(0, 300),
    requirements: boundedJobStrings(context.requirements).slice(0, 12),
    preferredRequirements: boundedJobStrings(
      context.preferredRequirements,
    ).slice(0, 8),
    skills: boundedJobStrings(context.skills).slice(0, 20),
  };
}

function deterministicRelevantEvidence(
  evidence: readonly ContextualEvidence[],
  question: ResolvableApplicationQuestion,
  jobContext: ApplicationJobContext | undefined,
) {
  const queryTerms = terms(
    `${question.label} ${jobContext?.title ?? ""} ${boundedJobStrings(jobContext?.skills).join(" ")}`,
  );
  return evidence
    .filter((item) => item.type === "EXPERIENCE")
    .map((item) => {
      const evidenceTerms = new Set(terms(item.summary));
      const overlap = queryTerms.filter((term) => evidenceTerms.has(term));
      return { item, overlap };
    })
    .filter((candidate) => candidate.overlap.length > 0);
}

function deterministicPredicateEvidence(
  evidence: readonly ContextualEvidence[],
  question: ResolvableApplicationQuestion,
) {
  const requiredTerms = professionalHistoryPredicateTerms(question);
  if (!requiredTerms) return [];
  return evidence.filter((item) => {
    const summary = normalizedChoiceText(item.summary);
    return requiredTerms.every((required) => summary.includes(required));
  });
}

const PROTECTED_CLOSED_WORLD_QUESTION =
  /\b(?:criminal|legal|arrest|conviction|background check|disab|medical|health|demographic|race|ethnicity|gender|sex|veteran|citizen|citizenship|nationality|authorized|authorization|sponsor|sponsorship|visa|consent|privacy|data processing|salary|compensation|pay|identifier|social security|cpf|currently work|currently employed|employee of)\b/u;

function professionalHistoryPredicateTerms(
  question: ResolvableApplicationQuestion,
): readonly string[] | null {
  const value = normalizedChoiceText(
    `${question.label} ${question.fieldNames.join(" ")}`,
  );
  if (
    PROTECTED_CLOSED_WORLD_QUESTION.test(value) ||
    /\b(?:worked|work|employed) (?:at|for|by)\b/u.test(value)
  )
    return null;
  const rules: readonly { pattern: RegExp; required: readonly string[] }[] = [
    { pattern: /\baccount executive\b/u, required: ["account executive"] },
    { pattern: /\bclosing role\b/u, required: ["closing"] },
    {
      pattern: /\bb2b.{0,10}saas|saas.{0,10}b2b\b/u,
      required: ["b2b", "saas"],
    },
    { pattern: /\bpython\b/u, required: ["python"] },
    {
      pattern: /\bcloud.{0,10}security|security.{0,10}cloud\b/u,
      required: ["cloud", "security"],
    },
    {
      pattern: /\bmanaged people|manage people|people management\b/u,
      required: ["managed", "people"],
    },
  ];
  const rule = rules.find((candidate) => candidate.pattern.test(value));
  if (rule) return rule.required;
  if (
    !/\b(?:experience (?:with|using|in|as)|(?:have|has|prior|previous|existing).{0,50}experience|worked with|used professionally|professional use)\b/u.test(
      value,
    )
  )
    return null;
  const subject = value
    .replace(
      /\b(?:do you|have you|has the candidate|does the candidate|candidate|your|you|prior|previous|existing|professional|professionally|relevant|work|worked|used|use|using|experience|experiencia|anos?|years?|with|in|as|of|the|a|an)\b/gu,
      " ",
    )
    .replace(/\s+/gu, " ")
    .trim();
  const required = terms(subject).slice(0, 6);
  return required.length ? required : null;
}

function boundedProfessionalHistoryPredicate(
  question: ResolvableApplicationQuestion,
) {
  return professionalHistoryPredicateTerms(question) !== null;
}

function activeAuthority(
  knowledge: ReadonlyMap<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >,
  concept:
    | "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION"
    | "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
  key: "attested" | "authorized",
) {
  const result = knowledge.get(concept);
  return result &&
    result.status === "AVAILABLE" &&
    result.freshness === "CURRENT" &&
    !result.conflict &&
    result.candidateApproved &&
    result.reusable &&
    result.applicationUse === "PREFERENCE_CONTEXT_ONLY" &&
    result.value?.[key] === true
    ? result
    : null;
}

function professionalHistoryNegativeAuthority(
  knowledge: ReadonlyMap<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >,
) {
  const completeness = activeAuthority(
    knowledge,
    "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
    "attested",
  );
  const negativeInference = activeAuthority(
    knowledge,
    "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
    "authorized",
  );
  return completeness && negativeInference
    ? {
        references: [referenceId(completeness), referenceId(negativeInference)],
      }
    : null;
}

function clearlyNoRelevantExperience(
  evidence: readonly ContextualEvidence[],
  jobContext: ApplicationJobContext | undefined,
) {
  const employment = evidence.filter((item) => item.type === "EXPERIENCE");
  if (!employment.length) return true;
  const target = normalizedChoiceText(
    `${jobContext?.title ?? ""} ${boundedJobStrings(jobContext?.skills).join(" ")}`,
  );
  const domains = [
    {
      id: "SALES",
      pattern:
        /\b(?:sales|account executive|closing|business development|b2b)\b/u,
    },
    {
      id: "SECURITY",
      pattern:
        /\b(?:security|cybersecurity|cyber|infosec|penetration testing)\b/u,
    },
    {
      id: "SOFTWARE_ENGINEERING",
      pattern:
        /\b(?:software|developer|engineering|programming|python|typescript|java)\b/u,
    },
  ];
  const targetDomains = domains.filter((domain) => domain.pattern.test(target));
  if (targetDomains.length !== 1) return false;
  return employment.every((item) => {
    const evidenceDomains = domains.filter((domain) =>
      domain.pattern.test(normalizedChoiceText(item.summary)),
    );
    return (
      evidenceDomains.length > 0 &&
      evidenceDomains.every((domain) => domain.id !== targetDomains[0]!.id)
    );
  });
}

function experienceIntervals(evidence: readonly ContextualEvidence[]) {
  return evidence
    .filter((item) => item.type === "EXPERIENCE")
    .map((item): DatedExperienceInterval => ({
      id: item.id,
      startDate: item.startDate,
      endDate: item.endDate,
      isCurrent: item.isCurrent,
    }));
}

export function relevantExperienceResolution(input: {
  readonly question: ResolvableApplicationQuestion;
  readonly evidence: readonly ContextualEvidence[];
  readonly selectedEvidenceIds: readonly string[];
  readonly now?: Date;
  readonly automatic?: boolean;
}): ApplicationQuestionResolution | null {
  const selected = new Set(input.selectedEvidenceIds);
  const selectedEvidence = input.evidence.filter((item) =>
    selected.has(item.id),
  );
  if (
    selectedEvidence.length !== selected.size ||
    selectedEvidence.some((item) => item.type !== "EXPERIENCE")
  )
    return null;
  const duration = unionExperienceDurationMonths({
    experiences: experienceIntervals(selectedEvidence),
    selectedIds: input.selectedEvidenceIds,
    now: input.now,
  });
  if (
    duration.months <= 0 ||
    duration.invalidIds.length > 0 ||
    duration.includedIds.length !== selected.size
  )
    return null;
  const value = adaptExperienceDurationToEmployerControl(
    duration.months,
    input.question,
  );
  if (!value) return null;
  return {
    questionId: input.question.id,
    canonicalConcept: null,
    disposition: input.automatic ? "AUTO_RESOLVED" : "PROPOSED_FOR_CANDIDATE",
    value,
    candidateKnowledgeReferences: [...selected],
    reasonCode: input.automatic
      ? "CONTEXTUAL_EXPERIENCE_DURATION"
      : "CONTEXTUAL_EXPERIENCE_DURATION_APPROVAL_REQUIRED",
  };
}

function zeroExperienceResolution(input: {
  readonly question: ResolvableApplicationQuestion;
  readonly authorityReferences: readonly string[];
}) {
  const value = adaptExperienceDurationToEmployerControl(0, input.question);
  return value
    ? {
        questionId: input.question.id,
        canonicalConcept: null,
        disposition: "AUTO_RESOLVED" as const,
        value,
        candidateKnowledgeReferences: input.authorityReferences,
        reasonCode: "COMPLETE_HISTORY_SUPPORTS_ZERO_EXPERIENCE",
      }
    : null;
}

function yesResolution(input: {
  question: ResolvableApplicationQuestion;
  references: readonly string[];
  automatic: boolean;
}) {
  const value = adaptKnownValueToEmployerControl("Yes", input.question);
  return value
    ? {
        questionId: input.question.id,
        canonicalConcept: null,
        disposition: input.automatic
          ? ("AUTO_RESOLVED" as const)
          : ("PROPOSED_FOR_CANDIDATE" as const),
        value,
        candidateKnowledgeReferences: input.references,
        reasonCode: input.automatic
          ? "EXPLICIT_EXPERIENCE_SUPPORTS_YES"
          : "SEMANTIC_EXPERIENCE_SUPPORTS_YES_APPROVAL_REQUIRED",
      }
    : null;
}

export function resolveExperienceContextualQuestion(input: {
  readonly question: ResolvableApplicationQuestion;
  readonly knowledge: ReadonlyMap<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >;
  readonly jobContext?: ApplicationJobContext;
  readonly now?: Date;
}): ContextualQuestionResult | null {
  const relevant = relevantExperienceQuestion(input.question);
  const predicate = experiencePredicateQuestion(input.question);
  if (!relevant && !predicate) return null;
  const employment = input.knowledge.get("EMPLOYMENT_HISTORY");
  const evidence = contextualCandidateEvidence(input.knowledge);
  const negativeAuthority = professionalHistoryNegativeAuthority(
    input.knowledge,
  );

  if (relevant) {
    const missingHistoryCoveredByAuthority =
      negativeAuthority && (!employment || employment.status === "MISSING");
    if (
      !missingHistoryCoveredByAuthority &&
      (!employment ||
        employment.status !== "AVAILABLE" ||
        employment.conflict ||
        employment.freshness === "STALE" ||
        !employment.candidateApproved)
    )
      return {
        resolution: unavailableResolution({
          question: input.question,
          concept: null,
          reasonCode: employment?.conflict
            ? "CANDIDATE_KNOWLEDGE_CONFLICT"
            : "EXPERIENCE_EVIDENCE_MISSING",
        }),
      };
    const matches = deterministicRelevantEvidence(
      evidence,
      input.question,
      input.jobContext,
    );
    if (matches.length) {
      const resolution = relevantExperienceResolution({
        question: input.question,
        evidence,
        selectedEvidenceIds: matches.map((match) => match.item.id),
        now: input.now,
        automatic: matches.every(
          (match) => match.overlap.length >= 2 && match.item.autoResolve,
        ),
      });
      if (resolution) return { resolution };
      return {
        resolution: unavailableResolution({
          question: input.question,
          concept: null,
          references: matches.map((match) => match.item.id),
          reasonCode: "EXPERIENCE_DURATION_NOT_COMPUTABLE",
        }),
      };
    }
    if (
      negativeAuthority &&
      clearlyNoRelevantExperience(evidence, input.jobContext)
    ) {
      const zero = zeroExperienceResolution({
        question: input.question,
        authorityReferences: negativeAuthority.references,
      });
      if (zero) return { resolution: zero };
    }
    return {
      resolution: null,
      aiQuestion: {
        kind: "RELEVANT_EXPERIENCE",
        proposition: input.question.label,
        evidence: evidence
          .filter((item) => item.type === "EXPERIENCE")
          .slice(0, 30),
      },
    };
  }

  const matches = deterministicPredicateEvidence(evidence, input.question);
  if (matches.length) {
    const resolution = yesResolution({
      question: input.question,
      references: matches.map((item) => item.id),
      automatic: matches.every((item) => item.autoResolve),
    });
    return resolution
      ? { resolution }
      : {
          resolution: unavailableResolution({
            question: input.question,
            concept: null,
            reasonCode: "FIELD_TAXONOMY_MISMATCH",
          }),
        };
  }
  if (
    negativeAuthority &&
    boundedProfessionalHistoryPredicate(input.question)
  ) {
    const value = adaptKnownValueToEmployerControl("No", input.question);
    return {
      resolution: value
        ? {
            questionId: input.question.id,
            canonicalConcept: null,
            disposition: "AUTO_RESOLVED",
            value,
            candidateKnowledgeReferences: negativeAuthority.references,
            reasonCode: "COMPLETE_HISTORY_SUPPORTS_NO_EXPERIENCE",
          }
        : unavailableResolution({
            question: input.question,
            concept: null,
            references: negativeAuthority.references,
            reasonCode: "FIELD_TAXONOMY_MISMATCH",
          }),
    };
  }
  return evidence.length
    ? {
        resolution: null,
        aiQuestion: {
          kind: "EXPERIENCE_PREDICATE",
          proposition: input.question.label,
          evidence: evidence.slice(0, 40),
        },
      }
    : {
        resolution: unavailableResolution({
          question: input.question,
          concept: null,
          reasonCode: "EXPERIENCE_EVIDENCE_MISSING",
        }),
      };
}

export function semanticExperienceYesResolution(input: {
  readonly question: ResolvableApplicationQuestion;
  readonly evidence: readonly ContextualEvidence[];
  readonly selectedEvidenceIds: readonly string[];
}) {
  const selected = new Set(input.selectedEvidenceIds);
  if (
    selected.size === 0 ||
    input.selectedEvidenceIds.length !== selected.size ||
    [...selected].some((id) => !input.evidence.some((item) => item.id === id))
  )
    return null;
  return yesResolution({
    question: input.question,
    references: [...selected],
    automatic: false,
  });
}
