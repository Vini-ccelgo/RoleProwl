import type { AIProvider } from "@/core/contracts/ai-provider";
import {
  AIDataPolicyError,
  AIInvalidOutputError,
  ConfigurationError,
} from "@/core/errors/application-errors";
import type {
  CandidateKnowledgeConcept,
  CandidateKnowledgeQueryResult,
} from "@/core/domain/candidate/candidate-knowledge";
import {
  countryCodesExplicitlyNamed,
  jurisdictionCandidateKnowledgeConcept,
  legacyUsCandidateKnowledgeAlias,
  normalizeLanguageKey,
} from "@/core/domain/candidate/candidate-knowledge";
import type {
  ApplicationQuestionResolution,
  ResolvableApplicationQuestion,
} from "@/core/domain/applications/application-question-resolution";
import type { PublicApplicationQuestion } from "@/core/domain/applications/public-application-question";
import { encodedApplicationAnswer } from "@/core/domain/applications/application-packet";
import {
  adaptKnownValueToEmployerControl,
  employerQuestionOptions,
  normalizePersonalNameForEmployerPresentation,
} from "@/core/domain/applications/control-adaptation";
import { normalizedChoiceText } from "@/core/domain/applications/choice-taxonomy";
import { aiTaskDefinitions } from "@/features/ai/task-definitions";
import { resolveChoiceTaxonomyDeterministically } from "@/features/applications/resolve-choice-taxonomy";
import {
  contextualCandidateEvidence,
  minimizedApplicationJobContext,
  professionalHistoryNegativeAuthority,
  relevantExperienceResolution,
  resolveExperienceContextualQuestion,
  resolveKnownContextualQuestion,
  semanticExperienceYesResolution,
  type ApplicationJobContext,
  type ContextualAIQuestion,
  type ContextualEvidence,
} from "@/features/applications/resolve-contextual-question";
import type { Logger } from "@/lib/logging/logger";

export type {
  ApplicationAnswerResolutionDisposition,
  ApplicationQuestionResolution,
  ResolvableApplicationQuestion,
} from "@/core/domain/applications/application-question-resolution";

function normalized(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function searchable(question: PublicApplicationQuestion) {
  return normalized(
    `${question.label} ${question.fieldNames.join(" ")}`,
  ).toLocaleLowerCase("en-US");
}

const CONCEPT_PATTERNS: readonly [
  CandidateKnowledgeConcept,
  readonly RegExp[],
][] = [
  ["FIRST_NAME", [/\bfirst[ _-]?name\b/iu]],
  ["LAST_NAME", [/\blast[ _-]?name\b/iu]],
  ["APPLICATION_EMAIL", [/\be-?mail\b/iu]],
  ["PHONE", [/\b(?:phone|telephone|telefone|celular)\b/iu]],
  ["LINKEDIN_URL", [/\blinked\s*in\b/iu]],
  ["WEBSITE_URL", [/\b(?:website|portfolio|site pessoal)\b/iu]],
  [
    "CURRENT_EMPLOYMENT_STATUS",
    [
      /\bcurrent employment status\b/iu,
      /\batualmente.{0,20}(?:empregado|trabalhando)\b/iu,
    ],
  ],
  ["NOTICE_PERIOD", [/\bnotice period\b/iu, /\baviso pr[eé]vio\b/iu]],
  [
    "START_AVAILABILITY",
    [
      /\b(?:available|availability).{0,20}(?:start|begin)\b/iu,
      /\bdata.{0,10}(?:in[ií]cio|come[cç]ar)\b/iu,
    ],
  ],
  [
    "CURRENT_COMPENSATION",
    [
      /\bcurrent.{0,20}(?:salary|compensation|pay)\b/iu,
      /\bremunera[cç][aã]o atual\b/iu,
    ],
  ],
  [
    "DESIRED_SALARY",
    [
      /\b(?:desired|expected|target).{0,20}(?:salary|compensation|pay)\b/iu,
      /\bpretens[aã]o salarial\b/iu,
    ],
  ],
  [
    "REMOTE_PREFERENCE",
    [
      /\b(?:remote|hybrid|on[- ]?site).{0,20}(?:preference|arrangement|work)\b/iu,
      /\b(?:remoto|h[ií]brido|presencial).{0,20}prefer/iu,
    ],
  ],
  [
    "WILLING_TO_RELOCATE",
    [
      /\b(?:willing|open|able) to relocate\b/iu,
      /\b(?:dispon[ií]vel|aceita).{0,20}(?:mudan[cç]a|reloca[cç][aã]o)\b/iu,
    ],
  ],
  [
    "TRAVEL_AVAILABILITY",
    [
      /\b(?:willing|able|available) to travel\b/iu,
      /\btravel.{0,15}(?:percent|percentage|%)\b/iu,
      /\bdisponibilidade.{0,20}viaj/iu,
    ],
  ],
  [
    "CURRENT_LOCATION",
    [
      /\b(?:current|present) (?:city|location|residence)\b/iu,
      /\b(?:cidade|localiza[cç][aã]o|resid[eê]ncia) atual\b/iu,
      /\b(?:country|pa[ií]s).{0,20}(?:residence|resid[eê]ncia|currently reside)\b/iu,
      /\b(?:residence|resid[eê]ncia|currently reside).{0,20}(?:country|pa[ií]s)\b/iu,
    ],
  ],
  [
    "TARGET_ROLE",
    [/\b(?:target|desired|preferred).{0,15}(?:role|position|job)\b/iu],
  ],
  [
    "WORK_ENVIRONMENT_PREFERENCE",
    [
      /\b(?:work|team|company) environment.{0,20}(?:preference|preferred|thrive)\b/iu,
    ],
  ],
  [
    "PROFESSIONAL_STRENGTHS",
    [/\bprofessional strengths?\b/iu, /\bpontos fortes profissionais\b/iu],
  ],
  [
    "REUSABLE_SELF_DESCRIPTION",
    [
      /\b(?:describe yourself|professional (?:bio|description|summary))\b/iu,
      /\b(?:resumo|descri[cç][aã]o) profissional\b/iu,
    ],
  ],
];

const EXACT_IDENTITY_LABELS: Readonly<
  Record<string, CandidateKnowledgeConcept>
> = {
  nome: "FIRST_NAME",
  "primeiro nome": "FIRST_NAME",
  primeiro_nome: "FIRST_NAME",
  "primeiro-nome": "FIRST_NAME",
  sobrenome: "LAST_NAME",
};

function exactIdentityConcept(question: PublicApplicationQuestion) {
  for (const candidate of [question.label, ...question.fieldNames]) {
    const concept =
      EXACT_IDENTITY_LABELS[normalized(candidate).toLocaleLowerCase("en-US")];
    if (concept) return concept;
  }
  return null;
}

type JurisdictionSensitiveFamily =
  "WORK_AUTHORIZATION" | "SPONSORSHIP_REQUIREMENT";

export interface ApplicationJurisdictionContext {
  readonly jobLocations?: readonly string[] | null;
}

const AUTHORIZATION_PATTERNS = [
  /\b(?:authorized|eligible|permitted|legally able) to work\b/iu,
  /\bwork authorization\b/iu,
  /\bautoriza[cç][aã]o para trabalhar\b/iu,
  /\b(?:possui|tem|legalmente|est[aá])?.{0,18}autorizad[oa] a trabalhar\b/iu,
] as const;
const SPONSORSHIP_PATTERNS = [
  /\b(?:now or in the future).{0,30}(?:sponsorship|sponsor|visa)\b/iu,
  /\b(?:require|need).{0,25}(?:sponsorship|sponsor)\b/iu,
  /\b(?:visa|employment|immigration) sponsorship\b/iu,
  /\b(?:precisar[aá]|necessita|requer).{0,25}(?:patroc[ií]nio|sponsor).{0,20}(?:visto)?\b/iu,
  /\bpatroc[ií]nio de visto\b/iu,
] as const;

function jurisdictionSensitiveFamily(
  question: PublicApplicationQuestion,
): JurisdictionSensitiveFamily | null {
  const value = searchable(question);
  if (AUTHORIZATION_PATTERNS.some((pattern) => pattern.test(value)))
    return "WORK_AUTHORIZATION";
  if (SPONSORSHIP_PATTERNS.some((pattern) => pattern.test(value)))
    return "SPONSORSHIP_REQUIREMENT";
  return null;
}

function explicitCountryCode(value: string) {
  const found = new Set(countryCodesExplicitlyNamed(value));
  return found.size === 0
    ? undefined
    : found.size === 1
      ? [...found][0]!
      : null;
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
const US_SUBDIVISIONS = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

function locationCountryCode(location: string) {
  const explicit = explicitCountryCode(location);
  if (explicit !== undefined) return explicit;
  const subdivision = normalized(location).match(
    /(?:,|\s)\s*([A-Z]{2})$/u,
  )?.[1];
  if (!subdivision) return null;
  const brazil = BRAZIL_SUBDIVISIONS.has(subdivision);
  const unitedStates = US_SUBDIVISIONS.has(subdivision);
  if (brazil === unitedStates) return null;
  return brazil ? "BR" : "US";
}

export function applicationJurisdictionCountryCode(input: {
  readonly question: PublicApplicationQuestion;
  readonly context?: ApplicationJurisdictionContext;
}) {
  const explicit = explicitCountryCode(searchable(input.question));
  if (explicit !== undefined) return explicit;
  const locations = input.context?.jobLocations?.filter((item) => item.trim());
  if (!locations?.length) return null;
  const countries = locations.map(locationCountryCode);
  return countries.every((country): country is string => Boolean(country)) &&
    new Set(countries).size === 1
    ? countries[0]!
    : null;
}

const LANGUAGE_NAMES: Readonly<Record<string, readonly string[]>> = {
  english: ["english", "inglês", "ingles"],
  portuguese: ["portuguese", "português", "portugues"],
  spanish: ["spanish", "espanhol"],
  french: ["french", "francês", "frances"],
  german: ["german", "alemão", "alemao"],
};

export function mapApplicationQuestionToCandidateConcept(
  question: PublicApplicationQuestion,
  context?: ApplicationJurisdictionContext,
): CandidateKnowledgeConcept | null {
  const value = searchable(question);
  const exactIdentity = exactIdentityConcept(question);
  if (exactIdentity) return exactIdentity;
  const family = jurisdictionSensitiveFamily(question);
  if (family) {
    const countryCode = applicationJurisdictionCountryCode({
      question,
      context,
    });
    return countryCode
      ? jurisdictionCandidateKnowledgeConcept(family, countryCode)
      : null;
  }
  if (
    /\b(?:proficiency|fluency|fluent|comfort(?:able)?|n[ií]vel|flu[eê]ncia)\b/iu.test(
      value,
    )
  ) {
    for (const [key, names] of Object.entries(LANGUAGE_NAMES))
      if (names.some((name) => value.includes(name)))
        return `LANGUAGE_PROFICIENCY:${normalizeLanguageKey(key)}`;
  }
  if (/\b(?:speak|language|languages|fala|idioma|l[ií]ngua)\b/iu.test(value)) {
    for (const [key, names] of Object.entries(LANGUAGE_NAMES))
      if (names.some((name) => value.includes(name)))
        return `LANGUAGE:${normalizeLanguageKey(key)}`;
  }
  for (const [concept, patterns] of CONCEPT_PATTERNS)
    if (patterns.some((pattern) => pattern.test(value))) return concept;
  return null;
}

export function candidateKnowledgeDisplayValue(
  value: Readonly<Record<string, unknown>> | null,
) {
  if (!value) return null;
  if (Array.isArray(value.items)) {
    const items = value.items.flatMap((item) => {
      if (typeof item === "string" && item.trim()) return [item.trim()];
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      for (const key of ["text", "name", "value", "program", "title"]) {
        const candidate = record[key];
        if (typeof candidate === "string" && candidate.trim())
          return [candidate.trim()];
      }
      return [];
    });
    return items.length ? [...new Set(items)].join(", ") : null;
  }
  const proficiency = value.proficiency;
  if (typeof proficiency === "string" && proficiency.trim())
    return proficiency.trim();
  const amount = value.amount;
  if (typeof amount === "number" || typeof amount === "string") {
    const currency = typeof value.currency === "string" ? value.currency : null;
    const period = typeof value.period === "string" ? value.period : null;
    return [currency, String(amount), period].filter(Boolean).join(" ");
  }
  for (const key of [
    "text",
    "value",
    "answer",
    "selected",
    "status",
    "required",
    "language",
  ]) {
    const candidate = value[key];
    if (["string", "number", "boolean"].includes(typeof candidate))
      return String(candidate);
    if (
      Array.isArray(candidate) &&
      candidate.every((item) => typeof item === "string")
    )
      return candidate.join(", ");
  }
  return null;
}

function referenceId(result: CandidateKnowledgeQueryResult) {
  return `${result.concept}:${result.provenance?.source ?? "UNKNOWN"}:${result.provenance?.sourceId ?? "NONE"}`;
}

function adaptToField(
  value: string,
  question: PublicApplicationQuestion,
): {
  disposition: "AUTO_RESOLVED" | "PROPOSED_FOR_CANDIDATE";
  value: string;
} | null {
  const directlyAdapted = adaptKnownValueToEmployerControl(value, question);
  if (directlyAdapted)
    return { disposition: "AUTO_RESOLVED", value: directlyAdapted };
  if (!question.options.length) return { disposition: "AUTO_RESOLVED", value };
  const normalizedValue = normalized(value).toLocaleLowerCase("en-US");
  const tier = /(?:native|nativo)/u.test(normalizedValue)
    ? /(?:native|nativo)/u
    : /(?:fluent|fluente)/u.test(normalizedValue)
      ? /(?:fluent|fluente)/u
      : /(?:advanced|avançado|avancado|professional|profissional)/u.test(
            normalizedValue,
          )
        ? /(?:advanced|avançado|avancado|professional|profissional)/u
        : /(?:intermediate|intermediário|intermediario)/u.test(normalizedValue)
          ? /(?:intermediate|intermediário|intermediario)/u
          : null;
  const proficiency = tier
    ? employerQuestionOptions(question).find((option) =>
        tier.test(normalized(option.label).toLocaleLowerCase("en-US")),
      )
    : null;
  return proficiency
    ? { disposition: "PROPOSED_FOR_CANDIDATE", value: proficiency.value }
    : null;
}

const EMPLOYER_SPECIFIC =
  /\b(?:why (?:do you want to (?:work|join)|are you interested)|por que.{0,30}(?:empresa|companhia)|why .{1,40}\?)\b/iu;
const UNKNOWN_CONSEQUENTIAL =
  /\b(?:salary|compensation|pay|benefits?|authorized|authorization|sponsor|sponsorship|visa|clearance|criminal|legal|background check|relocat|travel|remunera[cç][aã]o|sal[aá]rio|benef[ií]cios?|visto|patroc[ií]nio)\b/iu;
const SENSITIVE_IDENTIFIER =
  /\b(?:cpf|social security|national identification|national id|tax identification|tax id)\b/iu;
const EMPLOYER_RELATIONSHIP =
  /\b(?:currently|atualmente).{0,30}(?:work|employed|employee|trabalh|funcion[aá]ri[oa]).{0,40}(?:at|for|no|na|do|da)\b|\b(?:employee|funcion[aá]ri[oa]).{0,30}(?:name|nome|id|identifier|matr[ií]cula)\b|\b(?:if|se).{0,50}(?:work|employed|trabalh|funcion[aá]ri[oa]).{0,50}(?:name|nome|id|matr[ií]cula)\b/iu;
const EDUCATION_COMPLETION =
  /\b(?:completed|complete|graduated).{0,30}(?:college|university|degree|higher education)|\b(?:curso superior|gradua[cç][aã]o).{0,20}(?:complet[oa]|conclu[ií]d[oa])\b/iu;
const EXPLICIT_APPLICATION_DECISION =
  /\b(?:consent|privacy|data processing|retention|transcription|acknowledg|concordo|consentimento|privacidade|processamento de dados|reten[cç][aã]o|transcri[cç][aã]o)\b/iu;

const AI_REFRAME_CONCEPTS = new Set<CandidateKnowledgeConcept>([
  "CURRENT_LOCATION",
  "EMPLOYMENT_HISTORY",
  "EDUCATION_HISTORY",
  "CERTIFICATIONS",
  "SKILLS",
  "PROJECTS",
  "CURRENT_EMPLOYMENT_STATUS",
  "NOTICE_PERIOD",
  "REMOTE_PREFERENCE",
  "WILLING_TO_RELOCATE",
  "TRAVEL_AVAILABILITY",
  "START_AVAILABILITY",
  "TARGET_ROLE",
  "WORK_ENVIRONMENT_PREFERENCE",
  "PROFESSIONAL_STRENGTHS",
  "REUSABLE_SELF_DESCRIPTION",
]);

function canSupplyToApplicationAI(item: CandidateKnowledgeQueryResult) {
  return (
    !item.conflict &&
    item.freshness === "CURRENT" &&
    (AI_REFRAME_CONCEPTS.has(item.concept) ||
      item.concept.startsWith("LANGUAGE:") ||
      item.concept.startsWith("LANGUAGE_PROFICIENCY:"))
  );
}

function deterministicResolution(
  question: ResolvableApplicationQuestion,
  knowledge: ReadonlyMap<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >,
  context?: ApplicationJurisdictionContext,
): ApplicationQuestionResolution | null {
  if (question.controlDisposition === "CANDIDATE_REQUIRED_EXTERNAL")
    return {
      questionId: question.id,
      canonicalConcept: null,
      disposition: "HUMAN_REQUIRED",
      value: null,
      candidateKnowledgeReferences: [],
      reasonCode: "EXTERNAL_OR_SENSITIVE_CONTROL",
    };
  if (question.controlDisposition === "UNSUPPORTED")
    return {
      questionId: question.id,
      canonicalConcept: null,
      disposition: "UNSUPPORTED",
      value: null,
      candidateKnowledgeReferences: [],
      reasonCode: "UNSUPPORTED_CONTROL",
    };
  if (
    ["COMPLIANCE", "DEMOGRAPHIC"].includes(question.group) ||
    EXPLICIT_APPLICATION_DECISION.test(searchable(question))
  )
    return {
      questionId: question.id,
      canonicalConcept: null,
      disposition: "CANDIDATE_REQUIRED",
      value: null,
      candidateKnowledgeReferences: [],
      reasonCode: "EXPLICIT_APPLICATION_DECISION_REQUIRED",
    };
  const concept = mapApplicationQuestionToCandidateConcept(question, context);
  if (!concept) {
    const value = searchable(question);
    if (SENSITIVE_IDENTIFIER.test(value))
      return {
        questionId: question.id,
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: [],
        reasonCode: "SENSITIVE_IDENTIFIER_REQUIRED",
      };
    if (EMPLOYER_RELATIONSHIP.test(value))
      return {
        questionId: question.id,
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: [],
        reasonCode: "EMPLOYER_SPECIFIC_ANSWER",
      };
    if (EDUCATION_COMPLETION.test(value))
      return {
        questionId: question.id,
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: [],
        reasonCode: "EDUCATION_COMPLETION_NOT_ESTABLISHED",
      };
    if (jurisdictionSensitiveFamily(question))
      return {
        questionId: question.id,
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: [],
        reasonCode: "AUTHORIZATION_JURISDICTION_REQUIRED",
      };
    if (EMPLOYER_SPECIFIC.test(value))
      return {
        questionId: question.id,
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: [],
        reasonCode: "EMPLOYER_SPECIFIC_ANSWER",
      };
    if (UNKNOWN_CONSEQUENTIAL.test(value))
      return {
        questionId: question.id,
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: [],
        reasonCode: "UNKNOWN_CONSEQUENTIAL_QUESTION",
      };
    return null;
  }
  const candidate = knowledge.get(concept);
  const rawValue = candidate?.value ?? null;
  const displayValue = candidateKnowledgeDisplayValue(rawValue);
  const authorizationStatus =
    (concept === "US_WORK_AUTHORIZATION" ||
      concept.startsWith("WORK_AUTHORIZATION:")) &&
    typeof rawValue?.status === "string"
      ? rawValue.status.toLocaleLowerCase("en-US")
      : null;
  const explicitLanguagePresence =
    concept.startsWith("LANGUAGE:") &&
    /\b(?:do you speak|can you speak|fala|consegue falar)\b/iu.test(
      searchable(question),
    );
  const resolvedValue = explicitLanguagePresence
    ? "Yes"
    : authorizationStatus
      ? /(?:not authorized|unauthorized|not eligible)/u.test(
          authorizationStatus,
        )
        ? "No"
        : /(?:authorized|eligible|citizen|permanent resident|green card)/u.test(
              authorizationStatus,
            )
          ? "Yes"
          : displayValue
      : displayValue;
  const value =
    resolvedValue && (concept === "FIRST_NAME" || concept === "LAST_NAME")
      ? normalizePersonalNameForEmployerPresentation(resolvedValue)
      : resolvedValue;
  if (!candidate || candidate.status === "MISSING")
    return {
      questionId: question.id,
      canonicalConcept: concept,
      disposition: "CANDIDATE_REQUIRED",
      value: null,
      candidateKnowledgeReferences: [],
      reasonCode: "CANDIDATE_KNOWLEDGE_MISSING",
    };
  const references = [referenceId(candidate)];
  const conflictResolvedAt = candidate.value?._candidateConflictResolvedAt;
  const conflictExplicitlyResolved =
    typeof conflictResolvedAt === "string" &&
    Number.isFinite(Date.parse(conflictResolvedAt)) &&
    candidate.conflictingEvidence.every(
      (item) => item.confirmedAt.getTime() <= Date.parse(conflictResolvedAt),
    );
  if (candidate.conflict && !conflictExplicitlyResolved)
    return {
      questionId: question.id,
      canonicalConcept: concept,
      disposition: "CANDIDATE_REQUIRED",
      value,
      candidateKnowledgeReferences: references,
      reasonCode: "CANDIDATE_KNOWLEDGE_CONFLICT",
      alternatives: candidate.conflictingEvidence.flatMap((item) => {
        const alternative = candidateKnowledgeDisplayValue(item.value);
        return alternative ? [alternative] : [];
      }),
    };
  if (candidate.status === "STALE_CONFIRMATION_REQUIRED")
    return {
      questionId: question.id,
      canonicalConcept: concept,
      disposition: "CANDIDATE_REQUIRED",
      value,
      candidateKnowledgeReferences: references,
      reasonCode: "CANDIDATE_KNOWLEDGE_STALE",
    };
  if (!value)
    return {
      questionId: question.id,
      canonicalConcept: concept,
      disposition: "CANDIDATE_REQUIRED",
      value: null,
      candidateKnowledgeReferences: references,
      reasonCode: "CANDIDATE_VALUE_NOT_REPRESENTABLE",
    };
  if (
    !candidate.candidateApproved ||
    !candidate.reusable ||
    !candidate.autoAnswerAllowed ||
    candidate.applicationUse !== "REUSABLE_ANSWER" ||
    candidate.freshness === "STALE"
  )
    return {
      questionId: question.id,
      canonicalConcept: concept,
      disposition: "PROPOSED_FOR_CANDIDATE",
      value,
      candidateKnowledgeReferences: references,
      reasonCode: "CANDIDATE_APPROVAL_REQUIRED",
    };
  const adapted = adaptToField(value, question);
  if (!adapted)
    return {
      questionId: question.id,
      canonicalConcept: concept,
      disposition: "CANDIDATE_REQUIRED",
      value,
      candidateKnowledgeReferences: references,
      reasonCode: "FIELD_TAXONOMY_MISMATCH",
      alternatives: question.options,
    };
  return {
    questionId: question.id,
    canonicalConcept: concept,
    disposition: adapted.disposition,
    value: adapted.value,
    candidateKnowledgeReferences: references,
    reasonCode:
      adapted.disposition === "AUTO_RESOLVED"
        ? "APPROVED_REUSABLE_KNOWLEDGE"
        : "FIELD_TAXONOMY_APPROVAL_REQUIRED",
  };
}

function groundedProposal(input: {
  readonly proposed: string;
  readonly question: string;
  readonly referencedValues: readonly string[];
  readonly options: readonly string[];
}) {
  const proposal = normalized(input.proposed);
  if (!proposal || !input.referencedValues.length) return false;
  if (input.options.length && !input.options.includes(proposal)) return false;
  const evidence = normalized(
    input.referencedValues.join(" "),
  ).toLocaleLowerCase("en-US");
  const proposed = proposal.toLocaleLowerCase("en-US");
  const numbers = proposed.match(/\b\d+(?:[.,]\d+)?\b/gu) ?? [];
  if (numbers.some((number) => !evidence.includes(number))) return false;
  const upgrades = [
    "native",
    "bilingual",
    "c2",
    "executive",
    "board",
    "client",
  ];
  if (
    upgrades.some((word) => proposed.includes(word) && !evidence.includes(word))
  )
    return false;
  const allowedText = `${evidence} ${normalized(input.question).toLocaleLowerCase("en-US")}`;
  const ignored = new Set([
    "about",
    "also",
    "from",
    "have",
    "into",
    "that",
    "their",
    "these",
    "this",
    "with",
    "your",
  ]);
  const words = proposed.match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  return (
    words.length > 0 &&
    words.every(
      (word) =>
        ignored.has(word) ||
        allowedText.includes(word) ||
        (word.length >= 6 && allowedText.includes(word.slice(0, 5))),
    )
  );
}

const MAX_SEMANTIC_QUESTIONS = 25;
const MAX_CANDIDATE_EVIDENCE = 80;

interface SemanticCandidateEvidence {
  readonly id: string;
  readonly concept: CandidateKnowledgeConcept | null;
  readonly type: ContextualEvidence["type"];
  readonly summary: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly isCurrent?: boolean;
  readonly autoResolve: boolean;
}

function boundedJobEvidence(context: ApplicationJobContext | undefined) {
  const bounded = minimizedApplicationJobContext(context);
  if (!bounded) return [];
  return [
    ...(bounded.title
      ? [{ id: "JOB:TITLE", type: "TITLE", text: bounded.title }]
      : []),
    ...bounded.requirements.map((text, index) => ({
      id: `JOB:REQUIREMENT:${index}`,
      type: "REQUIREMENT",
      text,
    })),
    ...bounded.preferredRequirements.map((text, index) => ({
      id: `JOB:PREFERRED_REQUIREMENT:${index}`,
      type: "PREFERRED_REQUIREMENT",
      text,
    })),
    ...bounded.skills.map((text, index) => ({
      id: `JOB:SKILL:${index}`,
      type: "SKILL",
      text,
    })),
  ].slice(0, 40);
}

function semanticResolutionMetadata(input: {
  readonly definition: { readonly promptVersion: string };
  readonly metadata: { readonly provider?: string; readonly model?: string };
  readonly jobEvidenceReferences: readonly string[];
  readonly employerOptionTargets: readonly string[];
}): NonNullable<ApplicationQuestionResolution["resolutionMetadata"]> {
  return {
    method: "SEMANTIC_AI",
    taskVersion: input.definition.promptVersion,
    ...(input.metadata.provider ? { provider: input.metadata.provider } : {}),
    ...(input.metadata.model ? { model: input.metadata.model } : {}),
    jobEvidenceReferences: input.jobEvidenceReferences,
    employerOptionTargets: input.employerOptionTargets,
  };
}

export async function resolveApplicationQuestions(input: {
  readonly ai?: AIProvider;
  readonly aiFactory?: () => AIProvider | undefined;
  readonly correlationId: string;
  readonly knowledge: readonly CandidateKnowledgeQueryResult[];
  readonly jurisdictionContext?: ApplicationJurisdictionContext;
  readonly jobContext?: ApplicationJobContext;
  readonly now?: Date;
  readonly applicationAnswers?: Readonly<Record<string, string>>;
  readonly questions: readonly ResolvableApplicationQuestion[];
  readonly userId: string;
  readonly log?: Logger;
}) {
  const startedAt = Date.now();
  const emit = (details: {
    status: string;
    reason: string;
    questionCount: number;
    resultCount?: number;
    provider?: string;
    model?: string;
    retryCount?: number;
  }) =>
    input.log?.log(
      details.status === "RESULTS_PROPOSED" ||
        details.status === "NO_ELIGIBLE_QUESTIONS" ||
        details.status === "NO_SUPPORTED_RESULTS"
        ? "info"
        : "warn",
      "ai_task_outcome",
      {
        task: "APPLICATION_QUESTION_RESOLUTION",
        correlationId: input.correlationId,
        status: details.status,
        reason: details.reason,
        questionCount: details.questionCount,
        resultCount: details.resultCount ?? 0,
        provider: details.provider,
        model: details.model,
        latencyMs: Date.now() - startedAt,
        retryCount: details.retryCount ?? 0,
      },
    );
  const knowledge = new Map<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >(input.knowledge.map((item) => [item.concept, item]));
  for (const item of input.knowledge) {
    const alias = legacyUsCandidateKnowledgeAlias(item.concept);
    if (alias && !knowledge.has(alias))
      knowledge.set(alias, { ...item, concept: alias });
  }
  const results = new Map<string, ApplicationQuestionResolution>();
  const unknown: ResolvableApplicationQuestion[] = [];
  const taxonomyEvidence = new Map<
    string,
    readonly {
      readonly autoResolve: boolean;
      readonly concept: CandidateKnowledgeConcept;
      readonly referenceId: string;
      readonly value: string;
    }[]
  >();
  const contextualAIQuestions = new Map<string, ContextualAIQuestion>();
  for (const question of input.questions) {
    const applicationAnswer = input.applicationAnswers?.[question.id];
    if (applicationAnswer) {
      results.set(question.id, {
        questionId: question.id,
        canonicalConcept: null,
        disposition: "AUTO_RESOLVED",
        value: applicationAnswer,
        candidateKnowledgeReferences: [],
        reasonCode: "APPLICATION_OVERRIDE",
      });
      continue;
    }
    const contextualResolutionAllowed =
      question.controlDisposition === "ROLEPROWL_RESOLVED" &&
      !["COMPLIANCE", "DEMOGRAPHIC"].includes(question.group) &&
      !EXPLICIT_APPLICATION_DECISION.test(searchable(question));
    const knownContextual = contextualResolutionAllowed
      ? resolveKnownContextualQuestion({
          question,
          questions: input.questions,
          knowledge,
          jobContext: input.jobContext,
        })
      : null;
    if (knownContextual?.resolution) {
      results.set(question.id, knownContextual.resolution);
      continue;
    }
    const deterministic = deterministicResolution(
      question,
      knowledge,
      input.jurisdictionContext,
    );
    if (deterministic?.canonicalConcept) {
      results.set(question.id, deterministic);
      continue;
    }
    const taxonomy =
      question.controlDisposition === "ROLEPROWL_RESOLVED" &&
      !["COMPLIANCE", "DEMOGRAPHIC"].includes(question.group)
        ? resolveChoiceTaxonomyDeterministically({
            applicationAnswers: input.applicationAnswers,
            knowledge,
            question,
            questions: input.questions,
          })
        : null;
    if (taxonomy?.resolution) {
      results.set(question.id, taxonomy.resolution);
      continue;
    }
    if (taxonomy?.semanticEvidence.length) {
      taxonomyEvidence.set(question.id, taxonomy.semanticEvidence);
      unknown.push(question);
      continue;
    }
    if (deterministic) {
      results.set(question.id, deterministic);
      continue;
    }
    const contextual = contextualResolutionAllowed
      ? resolveExperienceContextualQuestion({
          question,
          knowledge,
          jobContext: input.jobContext,
          now: input.now,
        })
      : null;
    if (contextual?.resolution) {
      results.set(question.id, contextual.resolution);
      continue;
    }
    if (contextual?.aiQuestion)
      contextualAIQuestions.set(question.id, contextual.aiQuestion);
    unknown.push(question);
  }
  const taxonomyUnknown = unknown.filter((question) =>
    taxonomyEvidence.has(question.id),
  );
  if (taxonomyUnknown.length) {
    const supplied = [
      ...new Map(
        taxonomyUnknown
          .flatMap((question) => taxonomyEvidence.get(question.id) ?? [])
          .map((item) => [item.referenceId, item]),
      ).values(),
    ];
    let ai = input.ai;
    try {
      ai ??= input.aiFactory?.();
      if (!ai) throw new ConfigurationError("AI provider unavailable.");
      const definition = aiTaskDefinitions.APPLICATION_QUESTION_RESOLUTION;
      const generated = await ai.generateStructured({
        ...definition,
        task: "APPLICATION_QUESTION_RESOLUTION",
        dataClassification: "REAL_CANDIDATE",
        correlationId: input.correlationId,
        rateLimitSubject: input.userId,
        input: {
          mode: "CHOICE_TAXONOMY",
          questions: taxonomyUnknown.map((question) => ({
            id: question.id,
            label: question.label,
            fieldTypes: question.fieldTypes,
            optionLabels: employerQuestionOptions(question).map(
              (option) => option.label,
            ),
            candidateKnowledge: (taxonomyEvidence.get(question.id) ?? []).map(
              ({ referenceId, concept, value }) => ({
                referenceId,
                concept,
                value,
              }),
            ),
          })),
          allowedConcepts: [...new Set(supplied.map((item) => item.concept))],
        },
      });
      let accepted = 0;
      for (const proposal of generated.data.resolutions) {
        const question = taxonomyUnknown.find(
          (candidate) => candidate.id === proposal.questionId,
        );
        if (!question || results.has(question.id)) continue;
        const evidence = taxonomyEvidence.get(question.id) ?? [];
        const compatibilityProposal = proposal as typeof proposal & {
          readonly candidateKnowledgeReferences?: readonly string[];
        };
        const submittedReferences =
          proposal.candidateEvidenceIds ??
          compatibilityProposal.candidateKnowledgeReferences ??
          [];
        const proposedReferences = [...new Set(submittedReferences)];
        const referenced = proposedReferences.flatMap((id) =>
          evidence.filter((item) => item.referenceId === id),
        );
        const allowedOptions = question.optionIdentities?.length
          ? question.optionIdentities
          : question.options.map((option) => ({
              label: option,
              value: option,
            }));
        const optionTargets = [
          ...new Set(proposal.employerOptionTargets ?? []),
        ];
        const selected = optionTargets.flatMap((target) => {
          const normalizedTarget = normalizedChoiceText(target);
          const match = allowedOptions.find(
            (option) => normalizedChoiceText(option.label) === normalizedTarget,
          );
          return match ? [match.value] : [];
        });
        const grounded =
          proposal.canonicalConcept === "EDUCATION_HISTORY" &&
          (!proposal.resolutionClass ||
            proposal.resolutionClass === "TAXONOMY_TARGET") &&
          (!proposal.grounding || proposal.grounding === "GROUNDED") &&
          (proposal.jobEvidenceIds?.length ?? 0) === 0 &&
          referenced.length > 0 &&
          proposedReferences.length === submittedReferences.length &&
          referenced.length === proposedReferences.length &&
          optionTargets.length === selected.length &&
          selected.length > 0 &&
          selected.length <= referenced.length &&
          selected.every((value) =>
            allowedOptions.some((option) => option.value === value),
          );
        if (!grounded) continue;
        const autoResolved =
          proposal.confidence >= 0.95 &&
          proposal.requiresCandidateConfirmation === false &&
          referenced.every((item) => item.autoResolve);
        results.set(question.id, {
          questionId: question.id,
          canonicalConcept: "EDUCATION_HISTORY",
          disposition: autoResolved
            ? "AUTO_RESOLVED"
            : "PROPOSED_FOR_CANDIDATE",
          value: question.fieldTypes.includes("multi_value_multi_select")
            ? JSON.stringify(selected)
            : encodedApplicationAnswer(selected),
          candidateKnowledgeReferences: referenced.map(
            (item) => item.referenceId,
          ),
          reasonCode: autoResolved
            ? "SEMANTIC_TAXONOMY_MATCH"
            : "SEMANTIC_TAXONOMY_APPROVAL_REQUIRED",
          resolutionMetadata: semanticResolutionMetadata({
            definition,
            metadata: generated.metadata,
            jobEvidenceReferences: proposal.jobEvidenceIds ?? [],
            employerOptionTargets: optionTargets,
          }),
        });
        accepted += 1;
      }
      emit({
        status: accepted ? "RESULTS_PROPOSED" : "NO_SUPPORTED_RESULTS",
        reason: accepted
          ? "GROUNDED_TAXONOMY_RESULTS"
          : "ALL_TAXONOMY_RESULTS_REJECTED",
        questionCount: taxonomyUnknown.length,
        resultCount: accepted,
        provider: generated.metadata.provider,
        model: generated.metadata.model,
        retryCount: generated.metadata.retryCount,
      });
    } catch (error) {
      emit({
        status:
          error instanceof ConfigurationError
            ? "PROVIDER_DISABLED"
            : error instanceof AIDataPolicyError
              ? "POLICY_BLOCKED"
              : error instanceof AIInvalidOutputError
                ? "INVALID_PROVIDER_OUTPUT"
                : "PROVIDER_FAILED",
        reason:
          error instanceof ConfigurationError
            ? "PROVIDER_CONFIGURATION_UNAVAILABLE"
            : error instanceof AIDataPolicyError
              ? "REAL_CANDIDATE_DATA_POLICY_BLOCKED"
              : error instanceof AIInvalidOutputError
                ? "STRUCTURED_OUTPUT_INVALID"
                : "PROVIDER_REQUEST_FAILED",
        questionCount: taxonomyUnknown.length,
      });
    }
  }
  const ordinaryUnknown = unknown.filter(
    (question) => !taxonomyEvidence.has(question.id),
  );
  if (!ordinaryUnknown.length) {
    if (!unknown.length)
      emit({
        status: "NO_ELIGIBLE_QUESTIONS",
        reason: "ALL_QUESTIONS_DETERMINISTICALLY_CLASSIFIED",
        questionCount: 0,
      });
  } else {
    const suppliedKnowledge = input.knowledge.flatMap((item) => {
      const value = candidateKnowledgeDisplayValue(item.value);
      return item.status === "AVAILABLE" &&
        item.candidateApproved &&
        item.reusable &&
        item.applicationUse === "REUSABLE_ANSWER" &&
        canSupplyToApplicationAI(item) &&
        value
        ? [
            {
              referenceId: referenceId(item),
              concept: item.concept,
              value: value.slice(0, 2_000),
            },
          ]
        : [];
    });
    const contextualEvidence = contextualCandidateEvidence(knowledge);
    const contextualConcept: Readonly<
      Record<ContextualEvidence["type"], CandidateKnowledgeConcept | null>
    > = {
      EXPERIENCE: "EMPLOYMENT_HISTORY",
      SKILL: "SKILLS",
      PROJECT: "PROJECTS",
      CERTIFICATION: "CERTIFICATIONS",
      EDUCATION: "EDUCATION_HISTORY",
      LANGUAGE: null,
      FACT: null,
    };
    const authorityEvidence = input.knowledge.flatMap(
      (item): SemanticCandidateEvidence[] => {
        if (
          item.status !== "AVAILABLE" ||
          item.freshness !== "CURRENT" ||
          item.conflict ||
          !item.candidateApproved ||
          !item.reusable ||
          item.applicationUse !== "PREFERENCE_CONTEXT_ONLY" ||
          ![
            "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION",
            "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION",
          ].includes(item.concept)
        )
          return [];
        if (
          (item.concept === "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION" &&
            item.value?.attested !== true) ||
          (item.concept ===
            "NEGATIVE_PROFESSIONAL_HISTORY_INFERENCE_AUTHORIZATION" &&
            item.value?.authorized !== true)
        )
          return [];
        return [
          {
            id: referenceId(item),
            concept: item.concept,
            type: "FACT",
            summary:
              item.concept === "PROFESSIONAL_HISTORY_COMPLETENESS_ATTESTATION"
                ? "Candidate attested that professional history is complete."
                : "Candidate authorized bounded negative professional-history inference.",
            autoResolve: false,
          },
        ];
      },
    );
    const semanticEvidence = [
      ...authorityEvidence,
      ...contextualEvidence.map((item): SemanticCandidateEvidence => ({
        ...item,
        concept: contextualConcept[item.type],
      })),
      ...suppliedKnowledge.map((item): SemanticCandidateEvidence => ({
        id: item.referenceId,
        concept: item.concept,
        type:
          item.concept.startsWith("LANGUAGE:") ||
          item.concept.startsWith("LANGUAGE_PROFICIENCY:")
            ? "LANGUAGE"
            : "FACT",
        summary: item.value,
        autoResolve: true,
      })),
    ]
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.id === item.id) === index,
      )
      .slice(0, MAX_CANDIDATE_EVIDENCE);
    const jobEvidence = boundedJobEvidence(input.jobContext);
    const batchedQuestions = ordinaryUnknown.slice(0, MAX_SEMANTIC_QUESTIONS);
    if (!semanticEvidence.length) {
      emit({
        status: "NO_ELIGIBLE_QUESTIONS",
        reason: "NO_SAFE_SUPPORTED_CANDIDATE_KNOWLEDGE",
        questionCount: batchedQuestions.length,
      });
    } else {
      let ai = input.ai;
      let providerConstructionFailed = false;
      try {
        ai ??= input.aiFactory?.();
      } catch (error) {
        providerConstructionFailed = true;
        emit({
          status:
            error instanceof ConfigurationError
              ? "PROVIDER_DISABLED"
              : "PROVIDER_FAILED",
          reason:
            error instanceof ConfigurationError
              ? "PROVIDER_CONFIGURATION_UNAVAILABLE"
              : "PROVIDER_CONSTRUCTION_FAILED",
          questionCount: ordinaryUnknown.length,
        });
      }
      if (!ai) {
        if (!providerConstructionFailed)
          emit({
            status: "PROVIDER_DISABLED",
            reason: input.aiFactory
              ? "PROVIDER_CONFIGURATION_UNAVAILABLE"
              : "NO_PROVIDER_CONFIGURED",
            questionCount: ordinaryUnknown.length,
          });
      } else
        try {
          const definition = aiTaskDefinitions.APPLICATION_QUESTION_RESOLUTION;
          const generated = await ai.generateStructured({
            ...definition,
            task: "APPLICATION_QUESTION_RESOLUTION",
            dataClassification: "REAL_CANDIDATE",
            correlationId: input.correlationId,
            rateLimitSubject: input.userId,
            input: {
              mode: "GENERAL_EVIDENCE_GROUNDED",
              jobEvidence,
              questions: batchedQuestions.map((question) => ({
                id: question.id,
                label: question.label,
                fieldTypes: question.fieldTypes,
                optionLabels: employerQuestionOptions(question).map(
                  (option) => option.label,
                ),
                ...(contextualAIQuestions.has(question.id)
                  ? {
                      contextualKind: contextualAIQuestions.get(question.id)!
                        .kind,
                      proposition: contextualAIQuestions.get(question.id)!
                        .proposition,
                      candidateEvidenceIds: contextualAIQuestions
                        .get(question.id)!
                        .evidence.map((item) => item.id),
                    }
                  : {}),
              })),
              candidateEvidence: semanticEvidence.map((item) => ({
                id: item.id,
                concept: item.concept,
                type: item.type,
                summary: item.summary,
                startDate: item.startDate,
                endDate: item.endDate,
                isCurrent: item.isCurrent,
              })),
            },
          });
          const byReference = new Map(
            semanticEvidence.map((item) => [item.id, item]),
          );
          let accepted = 0;
          for (const proposal of generated.data.resolutions) {
            const question = batchedQuestions.find(
              (item) => item.id === proposal.questionId,
            );
            if (!question || results.has(question.id)) continue;
            const compatibilityProposal = proposal as typeof proposal & {
              readonly candidateKnowledgeReferences?: readonly string[];
              readonly contextualKind?: ContextualAIQuestion["kind"];
              readonly proposition?: string;
              readonly proposedValue?: string | null;
              readonly supported?: boolean;
            };
            const submittedReferenceIds =
              proposal.candidateEvidenceIds ??
              compatibilityProposal.candidateKnowledgeReferences ??
              [];
            const referenceIds = [...new Set(submittedReferenceIds)];
            const references = referenceIds.flatMap((id) => {
              const item = byReference.get(id);
              return item ? [item] : [];
            });
            const submittedJobIds = proposal.jobEvidenceIds ?? [];
            const jobReferenceIds = [...new Set(submittedJobIds)];
            const citationsGrounded =
              referenceIds.length > 0 &&
              referenceIds.length === submittedReferenceIds.length &&
              references.length === referenceIds.length &&
              jobReferenceIds.length === submittedJobIds.length &&
              jobReferenceIds.every((id) =>
                jobEvidence.some((item) => item.id === id),
              );
            const outputGrounded =
              proposal.grounding === "GROUNDED" ||
              (!proposal.grounding &&
                compatibilityProposal.supported !== false);
            if (
              !citationsGrounded ||
              !outputGrounded ||
              proposal.confidence < 0.85
            )
              continue;
            const optionTargets = [
              ...new Set(proposal.employerOptionTargets ?? []),
            ];
            const resolutionMetadata = semanticResolutionMetadata({
              definition,
              metadata: generated.metadata,
              jobEvidenceReferences: jobReferenceIds,
              employerOptionTargets: optionTargets,
            });
            const contextual = contextualAIQuestions.get(question.id);
            if (contextual) {
              const resolutionClass =
                proposal.resolutionClass ??
                (compatibilityProposal.contextualKind === "RELEVANT_EXPERIENCE"
                  ? "EXPERIENCE_DURATION"
                  : "PROFESSIONAL_PREDICATE");
              const supported =
                (resolutionClass === "EXPERIENCE_DURATION" ||
                  resolutionClass === "PROFESSIONAL_PREDICATE") &&
                (!compatibilityProposal.contextualKind ||
                  compatibilityProposal.contextualKind === contextual.kind) &&
                (!compatibilityProposal.proposition ||
                  compatibilityProposal.proposition ===
                    contextual.proposition) &&
                referenceIds.every((id) =>
                  contextual.evidence.some((item) => item.id === id),
                );
              if (!supported) continue;
              const resolution =
                contextual.kind === "RELEVANT_EXPERIENCE"
                  ? relevantExperienceResolution({
                      question,
                      evidence: contextual.evidence,
                      selectedEvidenceIds: referenceIds,
                      now: input.now,
                      automatic:
                        proposal.requiresCandidateConfirmation === false,
                    })
                  : semanticExperienceYesResolution({
                      question,
                      evidence: contextual.evidence,
                      selectedEvidenceIds: referenceIds,
                      automatic:
                        proposal.requiresCandidateConfirmation === false,
                    });
              if (!resolution) continue;
              results.set(question.id, {
                ...resolution,
                resolutionMetadata,
              });
              accepted += 1;
              continue;
            }
            const resolutionClass = proposal.resolutionClass ?? "FACTUAL_VALUE";
            if (
              resolutionClass === "CANDIDATE_DECISION_REQUIRED" ||
              resolutionClass === "UNSUPPORTED" ||
              proposal.answerBasis === "CANDIDATE_DECISION"
            )
              continue;
            if (resolutionClass === "EXPERIENCE_DURATION") {
              const experienceReferences = references.filter(
                (item) => item.type === "EXPERIENCE",
              );
              if (experienceReferences.length !== references.length) continue;
              const resolution = relevantExperienceResolution({
                question,
                evidence: contextualEvidence,
                selectedEvidenceIds: referenceIds,
                now: input.now,
                automatic: proposal.requiresCandidateConfirmation === false,
              });
              if (!resolution) continue;
              results.set(question.id, { ...resolution, resolutionMetadata });
              accepted += 1;
              continue;
            }
            if (resolutionClass === "PROFESSIONAL_PREDICATE") {
              const semanticAnswer =
                proposal.canonicalSemanticAnswer ??
                compatibilityProposal.proposedValue;
              if (
                semanticAnswer &&
                /^(?:no|nao|não|false)$/iu.test(normalized(semanticAnswer))
              ) {
                const authority =
                  professionalHistoryNegativeAuthority(knowledge);
                const booleanOptions = employerQuestionOptions(question).map(
                  (option) => normalizedChoiceText(option.label),
                );
                const boundedBooleanControl =
                  booleanOptions.some((label) =>
                    /^(?:yes|sim|true)$/u.test(label),
                  ) &&
                  booleanOptions.some((label) =>
                    /^(?:no|nao|false)$/u.test(label),
                  );
                if (
                  !authority ||
                  !boundedBooleanControl ||
                  referenceIds.length !== authority.references.length ||
                  !referenceIds.every((id) => authority.references.includes(id))
                )
                  continue;
                const value = adaptKnownValueToEmployerControl("No", question);
                if (!value) continue;
                results.set(question.id, {
                  questionId: question.id,
                  canonicalConcept: null,
                  disposition: "AUTO_RESOLVED",
                  value,
                  candidateKnowledgeReferences: authority.references,
                  reasonCode: "SEMANTIC_COMPLETE_HISTORY_SUPPORTS_NO",
                  resolutionMetadata,
                });
                accepted += 1;
                continue;
              }
              if (
                semanticAnswer &&
                !/^(?:yes|sim|true)$/iu.test(normalized(semanticAnswer))
              )
                continue;
              const resolution = semanticExperienceYesResolution({
                question,
                evidence: semanticEvidence,
                selectedEvidenceIds: referenceIds,
                automatic: proposal.requiresCandidateConfirmation === false,
              });
              if (!resolution) continue;
              results.set(question.id, { ...resolution, resolutionMetadata });
              accepted += 1;
              continue;
            }
            const allowedOptions = employerQuestionOptions(question);
            const selected = optionTargets.flatMap((target) => {
              const normalizedTarget = normalizedChoiceText(target);
              const match = allowedOptions.find(
                (option) =>
                  normalizedChoiceText(option.label) === normalizedTarget,
              );
              return match ? [match.value] : [];
            });
            if (
              optionTargets.length &&
              (selected.length !== optionTargets.length || !selected.length)
            )
              continue;
            const conceptAllowed =
              proposal.canonicalConcept != null &&
              references.every(
                (item) => item.concept === proposal.canonicalConcept,
              );
            const semanticAnswer =
              proposal.canonicalSemanticAnswer ??
              compatibilityProposal.proposedValue;
            const value = selected.length
              ? question.fieldTypes.includes("multi_value_multi_select")
                ? JSON.stringify(selected)
                : encodedApplicationAnswer(selected)
              : semanticAnswer
                ? adaptKnownValueToEmployerControl(semanticAnswer, question)
                : null;
            const grounded =
              semanticAnswer != null &&
              groundedProposal({
                proposed: semanticAnswer,
                question: question.label,
                referencedValues: references.map((item) => item.summary),
                options: optionTargets.length ? [] : question.options,
              });
            if (
              conceptAllowed &&
              value &&
              (grounded ||
                (resolutionClass === "TAXONOMY_TARGET" && selected.length))
            ) {
              const autoResolved =
                proposal.requiresCandidateConfirmation === false &&
                references.every((item) => item.autoResolve);
              accepted += 1;
              results.set(question.id, {
                questionId: question.id,
                canonicalConcept:
                  proposal.canonicalConcept as CandidateKnowledgeConcept,
                disposition: autoResolved
                  ? "AUTO_RESOLVED"
                  : "PROPOSED_FOR_CANDIDATE",
                value,
                candidateKnowledgeReferences: referenceIds,
                reasonCode: autoResolved
                  ? "SEMANTIC_EVIDENCE_GROUNDED"
                  : "AI_GROUNDED_REFRAME_APPROVAL_REQUIRED",
                resolutionMetadata,
              });
            }
          }
          emit({
            status: accepted ? "RESULTS_PROPOSED" : "NO_SUPPORTED_RESULTS",
            reason: accepted
              ? "GROUNDED_RESULTS_PROPOSED"
              : generated.data.resolutions.length
                ? "ALL_RESULTS_REJECTED"
                : "PROVIDER_RETURNED_NO_RESULTS",
            questionCount: ordinaryUnknown.length,
            resultCount: accepted,
            provider: generated.metadata.provider,
            model: generated.metadata.model,
            retryCount: generated.metadata.retryCount,
          });
        } catch (error) {
          emit({
            status:
              error instanceof AIDataPolicyError
                ? "POLICY_BLOCKED"
                : error instanceof AIInvalidOutputError
                  ? "INVALID_PROVIDER_OUTPUT"
                  : "PROVIDER_FAILED",
            reason:
              error instanceof AIDataPolicyError
                ? "REAL_CANDIDATE_DATA_POLICY_BLOCKED"
                : error instanceof AIInvalidOutputError
                  ? "STRUCTURED_OUTPUT_INVALID"
                  : "PROVIDER_REQUEST_FAILED",
            questionCount: ordinaryUnknown.length,
          });
        }
    }
  }
  for (const question of unknown)
    if (!results.has(question.id))
      results.set(question.id, {
        questionId: question.id,
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: [],
        reasonCode: "NO_GROUNDED_CANDIDATE_KNOWLEDGE",
      });
  return input.questions.map((question) => results.get(question.id)!);
}
