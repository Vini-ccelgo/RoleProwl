import { answerMemoryStatus } from "./answer-memory";
import { mapQuestionToAnswerConcept } from "./answer-memory";
import type { PublicApplicationQuestion } from "./public-application-question";
import type {
  ApplicationAnswerResolutionDisposition,
  ApplicationQuestionControlDisposition,
  ApplicationQuestionResolution,
} from "./application-question-resolution";
import type { CandidateKnowledgeConcept } from "@/core/domain/candidate/candidate-knowledge";
import { ValidationError } from "@/core/errors/application-errors";
import { exclusiveChoiceValues } from "./choice-taxonomy";
import { normalizePersonalNameForEmployerPresentation } from "./control-adaptation";

export const APPLICATION_PACKET_VERSION = "application-packet-v1";

export type ApplicationFieldStatus =
  | "RESOLVED"
  | "UNRESOLVED"
  | "CONFLICTING"
  | "NOT_REQUIRED"
  | "CANDIDATE_REQUIRED_EXTERNAL"
  | "UNSUPPORTED";

export type { ApplicationQuestionControlDisposition };

export type ApplicationTransferStatus =
  | "NOT_ATTEMPTED"
  | "TRANSFERRED"
  | "VERIFIED"
  | "HUMAN_REQUIRED"
  | "UNSUPPORTED"
  | "FAILED";

export type ApplicationPacketProvenanceSource =
  | "APPLICATION_OVERRIDE"
  | "CANDIDATE_PROFILE"
  | "VERIFIED_RESUME_FACT"
  | "ACCOUNT_IDENTITY"
  | "STRUCTURED_CAREER_PROFILE"
  | "ANSWER_MEMORY"
  | "CANDIDATE_DOCUMENT"
  | "TAILORED_RESUME"
  | "GENERATED_ARTIFACT";

export interface ApplicationPacketProvenance {
  readonly source: ApplicationPacketProvenanceSource;
  readonly label: string;
}

export interface ApplicationPacketField {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly status: ApplicationFieldStatus;
  readonly value: string | null;
  readonly provenance: readonly ApplicationPacketProvenance[];
  readonly alternatives?: readonly string[];
}

export interface ApplicationPacketDocument {
  readonly kind: "RESUME" | "COVER_LETTER" | "OTHER";
  readonly label: string;
  readonly fileName: string | null;
  readonly contentType: string | null;
  readonly storageKey: string | null;
  readonly status: ApplicationFieldStatus;
  readonly provenance: readonly ApplicationPacketProvenance[];
  readonly externalTransferStatus?: "NOT_ATTEMPTED" | "HUMAN_REQUIRED";
}

export interface ApplicationPacketAnswer extends ApplicationPacketField {
  readonly questionId: string;
  readonly questionGroup?: PublicApplicationQuestion["group"];
  readonly classification: string;
  readonly fieldNames: readonly string[];
  readonly fieldTypes: readonly string[];
  readonly options: readonly string[];
  readonly optionIdentities?: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly controlDisposition?: ApplicationQuestionControlDisposition;
  readonly resolutionDisposition?: ApplicationAnswerResolutionDisposition;
  readonly canonicalConcept?: CandidateKnowledgeConcept | null;
  readonly resolutionReasonCode?: string;
  readonly candidateKnowledgeReferences?: readonly string[];
}

const IDENTITY_CONCEPTS: Readonly<
  Partial<Record<ApplicationIdentityKey, CandidateKnowledgeConcept>>
> = {
  firstName: "FIRST_NAME",
  lastName: "LAST_NAME",
  email: "APPLICATION_EMAIL",
  phone: "PHONE",
  location: "CURRENT_LOCATION",
};

function applicationAnswerCompatibilityKey(answer: ApplicationPacketAnswer) {
  if (!answer.canonicalConcept) return `question:${answer.questionId}`;
  const types = answer.fieldTypes
    .map((type) => type.toLocaleLowerCase("en-US"))
    .sort();
  if (
    answer.options.length === 0 &&
    types.length > 0 &&
    types.every((type) =>
      /(?:input_text|textarea|text_area|input_email|input_tel)/u.test(type),
    )
  )
    return `${answer.canonicalConcept}:TEXT`;
  if (answer.options.length > 0) {
    const options = (
      answer.optionIdentities?.length
        ? answer.optionIdentities
        : answer.options.map((option) => ({ label: option, value: option }))
    )
      .map((option) => ({
        label: normalizedQuestionLabel(option.label),
        value: normalizedQuestionLabel(option.value),
      }))
      .map((option) => JSON.stringify(option))
      .sort();
    return `${answer.canonicalConcept}:CHOICE:${JSON.stringify(options)}`;
  }
  return `${answer.canonicalConcept}:CONTROL:${JSON.stringify(types)}`;
}

export interface SemanticApplicationAnswerGroup {
  readonly key: string;
  readonly canonicalConcept: CandidateKnowledgeConcept | null;
  readonly answers: readonly ApplicationPacketAnswer[];
}

export function semanticApplicationAnswerGroups(
  answers: readonly ApplicationPacketAnswer[],
): SemanticApplicationAnswerGroup[] {
  const groups = new Map<string, ApplicationPacketAnswer[]>();
  for (const answer of answers) {
    const key = applicationAnswerCompatibilityKey(answer);
    groups.set(key, [...(groups.get(key) ?? []), answer]);
  }
  return [...groups].map(([key, groupedAnswers]) => ({
    key,
    canonicalConcept: groupedAnswers[0]?.canonicalConcept ?? null,
    answers: groupedAnswers,
  }));
}

export function candidateDecisionKey(
  field: ApplicationPacketField | ApplicationPacketAnswer,
) {
  if ("questionId" in field && field.canonicalConcept)
    return `concept:${field.canonicalConcept}`;
  if (!("questionId" in field)) {
    const concept = IDENTITY_CONCEPTS[field.key as ApplicationIdentityKey];
    if (concept) return `concept:${concept}`;
  }
  return `field:${field.key}`;
}

export function fanOutCompatibleApplicationAnswers(
  packetAnswers: readonly ApplicationPacketAnswer[],
  submitted: readonly { readonly key: string; readonly value: string | null }[],
) {
  const submittedById = new Map(
    submitted.map((answer) => [answer.key, answer]),
  );
  const expanded = new Map(submitted.map((answer) => [answer.key, answer]));
  for (const group of semanticApplicationAnswerGroups(packetAnswers)) {
    const supplied = group.answers.flatMap((answer) => {
      const candidate = submittedById.get(answer.questionId);
      return candidate?.value ? [candidate.value] : [];
    });
    const values = [...new Set(supplied)];
    if (values.length !== 1) continue;
    for (const answer of group.answers)
      expanded.set(answer.questionId, {
        key: answer.questionId,
        value: values[0]!,
      });
  }
  return [...expanded.values()];
}

export const APPLICATION_IDENTITY_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "location",
  "country",
] as const;
export type ApplicationIdentityKey = (typeof APPLICATION_IDENTITY_KEYS)[number];

export function isApplicationIdentityKey(
  value: string,
): value is ApplicationIdentityKey {
  return (APPLICATION_IDENTITY_KEYS as readonly string[]).includes(value);
}

export interface ApplicationPacketOverrides {
  readonly identity: Readonly<Partial<Record<ApplicationIdentityKey, string>>>;
  readonly answers: Readonly<Record<string, string>>;
}

export function applicationAnswerValues(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed))
      return [
        ...new Set(
          parsed.flatMap((candidate) =>
            typeof candidate === "string" && candidate.trim()
              ? [candidate.trim()]
              : [],
          ),
        ),
      ];
  } catch {
    // Scalar application answers are intentionally stored as plain strings.
  }
  return [value];
}

export function encodedApplicationAnswer(values: readonly string[]) {
  const normalized = [
    ...new Set(
      values.map((value) => value.normalize("NFKC").trim()).filter(Boolean),
    ),
  ];
  return normalized.length > 1
    ? JSON.stringify(normalized)
    : (normalized[0] ?? null);
}

export type ApplicationAnswerCardinality = "TEXT" | "SINGLE" | "MULTIPLE";

export function applicationAnswerCardinality(
  answer: Pick<ApplicationPacketAnswer, "fieldTypes" | "options">,
): ApplicationAnswerCardinality {
  if (!answer.options.length) return "TEXT";
  return answer.fieldTypes.includes("multi_value_multi_select")
    ? "MULTIPLE"
    : "SINGLE";
}

export function validatedApplicationAnswerValue(
  answer: Pick<
    ApplicationPacketAnswer,
    "fieldTypes" | "label" | "optionIdentities" | "options" | "required"
  >,
  submitted: readonly string[],
) {
  const values = [
    ...new Set(
      submitted.map((value) => value.normalize("NFKC").trim()).filter(Boolean),
    ),
  ];
  const cardinality = applicationAnswerCardinality(answer);
  if (answer.required && values.length === 0)
    throw new ValidationError(
      `Select or enter an answer for “${answer.label}”.`,
    );
  if (cardinality !== "MULTIPLE" && values.length > 1)
    throw new ValidationError(`Choose only one answer for “${answer.label}”.`);
  if (cardinality === "TEXT") return values[0] ?? null;

  const options = answer.optionIdentities?.length
    ? answer.optionIdentities
    : answer.options.map((option) => ({ label: option, value: option }));
  const canonical = values.map((value) => {
    const identityMatches = options.filter((option) => option.value === value);
    if (identityMatches.length === 1) return identityMatches[0]!.value;
    const labelMatches = options.filter((option) => option.label === value);
    if (labelMatches.length === 1) return labelMatches[0]!.value;
    throw new ValidationError(
      `An option selected for “${answer.label}” is no longer available.`,
    );
  });
  const exclusive = exclusiveChoiceValues(options);
  if (
    canonical.some((value) => exclusive.has(value)) &&
    canonical.some((value) => !exclusive.has(value))
  )
    throw new ValidationError(
      `An exclusive option for “${answer.label}” cannot be combined with other answers.`,
    );
  return cardinality === "MULTIPLE" && canonical.length
    ? JSON.stringify(canonical)
    : encodedApplicationAnswer(canonical);
}

export function parseApplicationPacketOverrides(
  value: unknown,
): ApplicationPacketOverrides {
  const root =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const identityValue =
    root.identity &&
    typeof root.identity === "object" &&
    !Array.isArray(root.identity)
      ? (root.identity as Record<string, unknown>)
      : {};
  const answerValue =
    root.answers &&
    typeof root.answers === "object" &&
    !Array.isArray(root.answers)
      ? (root.answers as Record<string, unknown>)
      : {};
  const identity = Object.fromEntries(
    APPLICATION_IDENTITY_KEYS.flatMap((key) => {
      const candidate = identityValue[key];
      return typeof candidate === "string" && candidate.trim()
        ? [[key, candidate.trim().slice(0, 4_000)]]
        : [];
    }),
  ) as Partial<Record<ApplicationIdentityKey, string>>;
  const answers = Object.fromEntries(
    Object.entries(answerValue).flatMap(([key, candidate]) =>
      key.length <= 500 && typeof candidate === "string" && candidate.trim()
        ? [[key, candidate.trim().slice(0, 4_000)]]
        : [],
    ),
  );
  return { identity, answers };
}

export interface ApplicationFieldTransfer {
  readonly externalFieldId: string;
  readonly label: string;
  readonly packetFieldKey: string | null;
  readonly status: ApplicationTransferStatus;
}

export interface ApplicationPacket {
  readonly version: typeof APPLICATION_PACKET_VERSION;
  readonly builtAt: string;
  readonly reviewedAt: string | null;
  readonly reviewInvalidatedReason?:
    "MATERIAL_REQUIRED_QUESTION_SCHEMA_CHANGED" | null;
  readonly source: {
    readonly name: string;
    readonly inspection: "AVAILABLE" | "UNAVAILABLE" | "UNSUPPORTED";
  };
  readonly identity: readonly ApplicationPacketField[];
  readonly professional: {
    readonly targetRole: string;
    readonly experience: readonly string[];
    readonly education: readonly string[];
    readonly credentials: readonly string[];
    readonly skills: readonly string[];
    readonly languages: readonly string[];
    readonly workAuthorization: string | null;
    readonly sponsorshipRequired: boolean | null;
    readonly provenance: readonly ApplicationPacketProvenance[];
  };
  readonly documents: readonly ApplicationPacketDocument[];
  readonly answers: readonly ApplicationPacketAnswer[];
  readonly completeness: {
    readonly known: number;
    readonly ready: number;
    readonly needsReview: number;
    readonly humanRequired: number;
    readonly unsupported: number;
    readonly readyForSubmissionHandoff: boolean;
  };
  readonly transfer: {
    readonly mechanism: "MANUAL_ASSISTED" | "SUPPORTED_ATS" | "AUTHORIZED_API";
    readonly status: ApplicationTransferStatus;
    readonly fields: readonly ApplicationFieldTransfer[];
    readonly humanSteps: readonly {
      readonly label: string;
      readonly status: "HUMAN_REQUIRED";
    }[];
  };
}

export interface ApplicationPacketSource {
  readonly accountEmail: string | null;
  readonly profile: {
    readonly firstName: string;
    readonly lastName: string;
    readonly applicationEmail: string | null;
    readonly phone: string | null;
    readonly location: string | null;
    readonly countryCode: string | null;
    readonly professionalTitle: string | null;
  } | null;
  readonly profileProvenance?: ApplicationPacketProvenance;
  readonly verifiedResumeFacts: readonly {
    readonly factType: string;
    readonly text: string;
  }[];
  readonly applicationOverrides?: ApplicationPacketOverrides;
  readonly experience: readonly string[];
  readonly education: readonly string[];
  readonly credentials: readonly string[];
  readonly skills: readonly string[];
  readonly languages: readonly string[];
  readonly workAuthorization: string | null;
  readonly sponsorshipRequired: boolean | null;
  readonly answerMemories: readonly {
    readonly concept: string;
    readonly answer: Readonly<Record<string, unknown>>;
    readonly source: string;
    readonly verifiedAt: Date;
    readonly reverifyAfterDays: number | null;
    readonly autoAnswerAllowed: boolean;
  }[];
  readonly preferences?: {
    readonly desiredSalary: string | null;
    readonly willingToRelocate: boolean | null;
    readonly remotePreference: string | null;
    readonly travelPercent: number | null;
  } | null;
  readonly selectedResume: {
    readonly fileName: string;
    readonly contentType: string;
    readonly storageKey: string;
    readonly tailored: boolean;
  } | null;
  readonly coverLetter: {
    readonly fileName: string;
    readonly contentType: string;
    readonly storageKey: string | null;
  } | null;
  readonly questions: readonly PublicApplicationQuestion[];
  readonly questionResolutions?: readonly ApplicationQuestionResolution[];
  readonly questionInspection: "AVAILABLE" | "UNAVAILABLE" | "UNSUPPORTED";
  readonly sourceName: string;
  readonly targetRole: string;
}

function normalizedQuestionLabel(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

const ROLEPROWL_SUPPORTED_QUESTION_TYPES = new Set([
  "input_text",
  "textarea",
  "multi_value_single_select",
  "multi_value_multi_select",
  "input_radio",
  "input_checkbox",
  "external_consent",
]);

export function applicationQuestionControlDisposition(
  question: PublicApplicationQuestion,
): ApplicationQuestionControlDisposition {
  const searchable = normalizedQuestionLabel(
    `${question.label} ${question.fieldNames.join(" ")}`,
  );
  if (
    question.fieldTypes.includes("input_file") ||
    /\b(?:captcha|authentication|attest|signature|cpf|social security|national identification|national id|tax identification|tax id)\b/iu.test(
      searchable,
    )
  )
    return "CANDIDATE_REQUIRED_EXTERNAL";
  if (
    question.fieldTypes.includes("multi_value_multi_select") &&
    question.options.length === 0
  )
    return "CANDIDATE_REQUIRED_EXTERNAL";
  if (
    question.fieldTypes.length !== 1 ||
    !ROLEPROWL_SUPPORTED_QUESTION_TYPES.has(question.fieldTypes[0]!)
  )
    return "CANDIDATE_REQUIRED_EXTERNAL";
  return "ROLEPROWL_RESOLVED";
}

export type ApplicationQuestionHandoffClass =
  | "ROLEPROWL_CAN_COMPLETE"
  | "CANDIDATE_DECIDES_THEN_ROLEPROWL_TRANSFERS"
  | "IRREDUCIBLE_EMPLOYER_SITE_STEP";

export function applicationQuestionHandoffClass(
  answer: ApplicationPacketAnswer,
): ApplicationQuestionHandoffClass {
  if (
    answer.status === "CANDIDATE_REQUIRED_EXTERNAL" &&
    answer.classification === "DOCUMENT" &&
    Boolean(answer.value)
  )
    return "ROLEPROWL_CAN_COMPLETE";
  if (
    answer.status === "CANDIDATE_REQUIRED_EXTERNAL" ||
    answer.status === "UNSUPPORTED"
  )
    return "IRREDUCIBLE_EMPLOYER_SITE_STEP";
  if (
    answer.status === "RESOLVED" &&
    !answer.provenance.some((item) => item.source === "APPLICATION_OVERRIDE")
  )
    return "ROLEPROWL_CAN_COMPLETE";
  return "CANDIDATE_DECIDES_THEN_ROLEPROWL_TRANSFERS";
}

function materialQuestionSchemaEntry(input: {
  readonly group?: PublicApplicationQuestion["group"];
  readonly label: string;
  readonly required: boolean;
  readonly fieldTypes: readonly string[];
  readonly options: readonly string[];
  readonly optionIdentities?: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}) {
  return JSON.stringify({
    group: input.group ?? "STANDARD",
    label: normalizedQuestionLabel(input.label),
    required: input.required,
    fieldTypes: [...(input.fieldTypes ?? [])]
      .map(normalizedQuestionLabel)
      .sort(),
    options: (input.optionIdentities?.length
      ? input.optionIdentities
      : input.options.map((option) => ({ label: option, value: option }))
    )
      .map((option) => ({
        label: normalizedQuestionLabel(option.label),
        value: normalizedQuestionLabel(option.value),
      }))
      .map((option) => JSON.stringify(option))
      .sort(),
  });
}

export function materialRequiredQuestionSchemaChanged(input: {
  readonly previousAnswers: readonly ApplicationPacketAnswer[];
  readonly questions: readonly PublicApplicationQuestion[];
}) {
  const previous = input.previousAnswers
    .filter((answer) => answer.required)
    .map(materialQuestionSchemaEntry)
    .sort();
  const current = input.questions
    .filter((question) => question.required)
    .map(materialQuestionSchemaEntry)
    .sort();
  return JSON.stringify(previous) !== JSON.stringify(current);
}

export function reconcileApplicationQuestionOverrides(input: {
  readonly overrides: ApplicationPacketOverrides;
  readonly previousAnswers: readonly ApplicationPacketAnswer[];
  readonly questions: readonly PublicApplicationQuestion[];
}): ApplicationPacketOverrides {
  const nextAnswers = { ...input.overrides.answers };
  const currentIds = new Set(input.questions.map((question) => question.id));

  for (const [previousId, value] of Object.entries(input.overrides.answers)) {
    if (currentIds.has(previousId)) continue;
    const previous = input.previousAnswers.find(
      (answer) => answer.questionId === previousId,
    );
    if (!previous) continue;
    const candidates = input.questions.filter(
      (question) =>
        normalizedQuestionLabel(question.label) ===
          normalizedQuestionLabel(previous.label) &&
        (!previous.questionGroup || question.group === previous.questionGroup),
    );
    if (candidates.length !== 1) continue;
    const currentId = candidates[0]!.id;
    if (!(currentId in nextAnswers)) nextAnswers[currentId] = value;
    delete nextAnswers[previousId];
  }

  return { identity: input.overrides.identity, answers: nextAnswers };
}

function clean(value: string | null | undefined) {
  const normalized = value?.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return normalized || null;
}

function field(
  key: string,
  label: string,
  required: boolean,
  value: string | null,
  provenance: readonly ApplicationPacketProvenance[],
  alternatives: readonly string[] = [],
): ApplicationPacketField {
  return {
    key,
    label,
    required,
    status: value ? "RESOLVED" : required ? "UNRESOLVED" : "NOT_REQUIRED",
    value,
    provenance,
    ...(alternatives.length ? { alternatives } : {}),
  };
}

function emailField(source: ApplicationPacketSource) {
  const applicationSpecific = clean(
    source.applicationOverrides?.identity.email,
  );
  const explicit = clean(source.profile?.applicationEmail);
  const resumeEmails = [
    ...new Set(
      source.verifiedResumeFacts
        .filter((fact) => fact.factType === "PROFILE_EMAIL")
        .map((fact) => clean(fact.text)?.toLocaleLowerCase("en-US"))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  if (applicationSpecific)
    return field(
      "email",
      "Email",
      true,
      applicationSpecific,
      [
        {
          source: "APPLICATION_OVERRIDE",
          label: "Application-specific candidate answer",
        },
      ],
      [explicit, ...resumeEmails, clean(source.accountEmail)].flatMap(
        (value) =>
          value &&
          value.toLocaleLowerCase("en-US") !==
            applicationSpecific.toLocaleLowerCase("en-US")
            ? [value]
            : [],
      ),
    );
  if (explicit)
    return field(
      "email",
      "Email",
      true,
      explicit,
      [
        source.profileProvenance ?? {
          source: "CANDIDATE_PROFILE",
          label: "Application email",
        },
      ],
      resumeEmails.filter(
        (value) => value !== explicit.toLocaleLowerCase("en-US"),
      ),
    );
  if (resumeEmails.length > 1)
    return {
      ...field("email", "Email", true, null, [], resumeEmails),
      status: "CONFLICTING" as const,
      provenance: [
        {
          source: "VERIFIED_RESUME_FACT" as const,
          label: "Accepted résumé facts",
        },
      ],
    };
  if (resumeEmails[0])
    return field(
      "email",
      "Email",
      true,
      resumeEmails[0],
      [{ source: "VERIFIED_RESUME_FACT", label: "Accepted résumé fact" }],
      clean(source.accountEmail) &&
        clean(source.accountEmail)?.toLocaleLowerCase("en-US") !==
          resumeEmails[0]
        ? [clean(source.accountEmail)!]
        : [],
    );
  return field("email", "Email", true, clean(source.accountEmail), [
    ...(clean(source.accountEmail)
      ? [
          {
            source: "ACCOUNT_IDENTITY" as const,
            label: "Sign-in account email",
          },
        ]
      : []),
  ]);
}

function answerValue(answer: Readonly<Record<string, unknown>>) {
  for (const key of ["value", "answer", "text", "selected"]) {
    const value = answer[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      return String(value);
  }
  const scalar = Object.values(answer).find((value) =>
    ["string", "number", "boolean"].includes(typeof value),
  );
  return scalar == null ? null : String(scalar);
}

function requiredByQuestions(
  questions: readonly PublicApplicationQuestion[],
  patterns: readonly RegExp[],
) {
  return questions.some(
    (question) =>
      question.required &&
      patterns.some((pattern) =>
        pattern.test(`${question.label} ${question.fieldNames.join(" ")}`),
      ),
  );
}

function packetFieldForQuestion(
  question: PublicApplicationQuestion,
  identity: readonly ApplicationPacketField[],
  source: ApplicationPacketSource,
  now: Date,
  reviewed: boolean,
): ApplicationPacketAnswer {
  const searchable = `${question.label} ${question.fieldNames.join(" ")}`;
  const controlDisposition = applicationQuestionControlDisposition(question);
  const optionIdentities = question.optionIdentities?.length
    ? question.optionIdentities
    : question.options.map((option) => ({ label: option, value: option }));
  if (controlDisposition !== "ROLEPROWL_RESOLVED") {
    const selected = /\b(?:resume|résumé|cv)\b/iu.test(searchable)
      ? source.selectedResume
      : null;
    return {
      key: `question:${question.id}`,
      questionId: question.id,
      questionGroup: question.group,
      label: question.label,
      required: question.required,
      status: question.required ? controlDisposition : "NOT_REQUIRED",
      value: selected?.fileName ?? null,
      provenance: selected
        ? [
            {
              source: selected.tailored
                ? "TAILORED_RESUME"
                : "CANDIDATE_DOCUMENT",
              label: selected.tailored
                ? "Job-specific tailored résumé"
                : "Candidate-uploaded résumé",
            },
          ]
        : [],
      classification: selected ? "DOCUMENT" : "EXTERNAL_CONTROL",
      fieldNames: question.fieldNames,
      fieldTypes: question.fieldTypes,
      options: question.options,
      optionIdentities,
      controlDisposition,
    };
  }
  const applicationSpecific = clean(
    source.applicationOverrides?.answers[question.id],
  );
  if (applicationSpecific) {
    const suppliedValues = applicationAnswerValues(applicationSpecific);
    const canonicalSuppliedValues = suppliedValues.flatMap((value) => {
      const valueMatches = optionIdentities.filter(
        (option) => option.value === value,
      );
      if (valueMatches.length === 1) return [valueMatches[0]!.value];
      const labelMatches = optionIdentities.filter(
        (option) => option.label === value,
      );
      return labelMatches.length === 1 ? [labelMatches[0]!.value] : [];
    });
    const multiple = question.fieldTypes.includes("multi_value_multi_select");
    const optionMismatch =
      optionIdentities.length > 0 &&
      (suppliedValues.length === 0 ||
        (!multiple && suppliedValues.length !== 1) ||
        canonicalSuppliedValues.length !== suppliedValues.length);
    const canonicalApplicationSpecific =
      optionIdentities.length > 0 && !optionMismatch
        ? multiple
          ? JSON.stringify(canonicalSuppliedValues)
          : encodedApplicationAnswer(canonicalSuppliedValues)
        : applicationSpecific;
    return {
      key: `question:${question.id}`,
      questionId: question.id,
      questionGroup: question.group,
      label: question.label,
      required: question.required,
      status: optionMismatch ? "CONFLICTING" : "RESOLVED",
      value: canonicalApplicationSpecific,
      provenance: [
        {
          source: "APPLICATION_OVERRIDE",
          label: "Application-specific candidate answer",
        },
      ],
      classification:
        /\b(?:authorized|authorization|sponsor|sponsorship|visa|certif|attest|signature)\b/iu.test(
          question.label,
        )
          ? "LEGAL_OR_CONSEQUENTIAL"
          : "APPLICATION_SPECIFIC",
      fieldNames: question.fieldNames,
      fieldTypes: question.fieldTypes,
      options: question.options,
      optionIdentities,
      controlDisposition,
      ...(optionMismatch ? { alternatives: question.options } : {}),
    };
  }
  const authoritative = source.questionResolutions?.find(
    (resolution) => resolution.questionId === question.id,
  );
  const direct = [
    [/\bfirst[ _-]?name\b/iu, "firstName"],
    [/\blast[ _-]?name\b/iu, "lastName"],
    [/\b(?:email|email_address)\b/iu, "email"],
    [/\b(?:phone|telephone)\b/iu, "phone"],
    [/\b(?:country|country_code)\b/iu, "country"],
    [/\b(?:current[ _-]?)?(?:city|location|address)\b/iu, "location"],
  ] as const;
  const mapped = direct.find(([pattern]) => pattern.test(searchable));
  const identityField = mapped
    ? identity.find((candidate) => candidate.key === mapped[1])
    : null;
  if (identityField && !authoritative)
    return {
      ...identityField,
      key: `question:${question.id}`,
      label: question.label,
      required: question.required,
      status:
        identityField.status === "RESOLVED"
          ? "RESOLVED"
          : question.required
            ? identityField.status === "CONFLICTING"
              ? "CONFLICTING"
              : "UNRESOLVED"
            : "NOT_REQUIRED",
      questionId: question.id,
      questionGroup: question.group,
      classification: "PROFILE_FACT",
      fieldNames: question.fieldNames,
      fieldTypes: question.fieldTypes,
      options: question.options,
      optionIdentities,
      controlDisposition,
    };

  if (/\b(?:resume|résumé|cv)\b/iu.test(searchable)) {
    const selected = source.selectedResume;
    return {
      key: `question:${question.id}`,
      questionId: question.id,
      questionGroup: question.group,
      label: question.label,
      required: question.required,
      status: selected
        ? reviewed
          ? "RESOLVED"
          : "UNRESOLVED"
        : question.required
          ? "UNRESOLVED"
          : "NOT_REQUIRED",
      value: selected?.fileName ?? null,
      provenance: selected
        ? [
            {
              source: selected.tailored
                ? "TAILORED_RESUME"
                : "CANDIDATE_DOCUMENT",
              label: selected.tailored
                ? "Job-specific tailored résumé"
                : "Candidate-uploaded résumé",
            },
          ]
        : [],
      classification: "DOCUMENT",
      fieldNames: question.fieldNames,
      fieldTypes: question.fieldTypes,
      options: question.options,
      optionIdentities,
      controlDisposition,
    };
  }

  if (authoritative) {
    const conflict =
      authoritative.reasonCode === "CANDIDATE_KNOWLEDGE_CONFLICT";
    const status: ApplicationFieldStatus =
      authoritative.disposition === "AUTO_RESOLVED"
        ? "RESOLVED"
        : authoritative.disposition === "HUMAN_REQUIRED"
          ? question.required
            ? "CANDIDATE_REQUIRED_EXTERNAL"
            : "NOT_REQUIRED"
          : authoritative.disposition === "UNSUPPORTED"
            ? question.required
              ? "UNSUPPORTED"
              : "NOT_REQUIRED"
            : question.required
              ? conflict
                ? "CONFLICTING"
                : "UNRESOLVED"
              : "NOT_REQUIRED";
    return {
      key: `question:${question.id}`,
      questionId: question.id,
      questionGroup: question.group,
      label: question.label,
      required: question.required,
      status,
      value: authoritative.value,
      provenance: authoritative.candidateKnowledgeReferences.length
        ? [
            {
              source: "STRUCTURED_CAREER_PROFILE",
              label:
                authoritative.disposition === "AUTO_RESOLVED"
                  ? "Approved reusable candidate knowledge"
                  : "Candidate knowledge awaiting approval",
            },
          ]
        : [],
      ...(authoritative.alternatives?.length
        ? { alternatives: authoritative.alternatives }
        : {}),
      classification: authoritative.canonicalConcept
        ? "CANDIDATE_KNOWLEDGE"
        : authoritative.reasonCode.startsWith("EMPLOYER_SPECIFIC_")
          ? "APPLICATION_SPECIFIC"
          : authoritative.reasonCode.startsWith("CONTEXTUAL_") ||
              authoritative.reasonCode.startsWith("EXPLICIT_EXPERIENCE_") ||
              authoritative.reasonCode.startsWith("SEMANTIC_EXPERIENCE_")
            ? "CONTEXTUAL_CANDIDATE_EVIDENCE"
            : "UNKNOWN",
      fieldNames: question.fieldNames,
      fieldTypes: question.fieldTypes,
      options: question.options,
      optionIdentities,
      controlDisposition,
      resolutionDisposition: authoritative.disposition,
      canonicalConcept: authoritative.canonicalConcept,
      resolutionReasonCode: authoritative.reasonCode,
      candidateKnowledgeReferences: authoritative.candidateKnowledgeReferences,
    };
  }

  const concept = mapQuestionToAnswerConcept(question.label);
  const memory = concept
    ? source.answerMemories.find((candidate) => candidate.concept === concept)
    : null;
  const legal =
    /\b(?:authorized|authorization|sponsor|sponsorship|visa)\b/iu.test(
      question.label,
    );
  const usable =
    memory &&
    answerMemoryStatus(memory, now) === "FRESH" &&
    (!legal || memory.source === "EXPLICIT_CONSEQUENTIAL");
  const value = usable ? answerValue(memory.answer) : null;
  const preferenceValue =
    !value && concept === "DESIRED_SALARY"
      ? source.preferences?.desiredSalary
      : !value && concept === "WILLING_TO_RELOCATE"
        ? source.preferences?.willingToRelocate == null
          ? null
          : String(source.preferences.willingToRelocate)
        : !value && concept === "REMOTE_PREFERENCE"
          ? source.preferences?.remotePreference
          : !value && concept === "TRAVEL_AVAILABILITY"
            ? source.preferences?.travelPercent == null
              ? null
              : String(source.preferences.travelPercent)
            : null;
  const resolvedValue = value ?? preferenceValue ?? null;
  return {
    key: `question:${question.id}`,
    questionId: question.id,
    questionGroup: question.group,
    label: question.label,
    required: question.required,
    status: resolvedValue
      ? "RESOLVED"
      : question.required
        ? "UNRESOLVED"
        : "NOT_REQUIRED",
    value: resolvedValue,
    provenance: resolvedValue
      ? value
        ? [
            {
              source: "ANSWER_MEMORY",
              label: `Verified ${concept ?? "application"} answer`,
            },
          ]
        : [
            {
              source: "STRUCTURED_CAREER_PROFILE",
              label: "Candidate preferences",
            },
          ]
      : [],
    classification: legal
      ? "LEGAL_OR_CONSEQUENTIAL"
      : concept
        ? "USER_POLICY"
        : "UNKNOWN",
    fieldNames: question.fieldNames,
    fieldTypes: question.fieldTypes,
    options: question.options,
    optionIdentities,
    controlDisposition,
  };
}

function identityValue(
  source: ApplicationPacketSource,
  key: ApplicationIdentityKey,
  profileValue: string | null | undefined,
) {
  const applicationSpecific = clean(source.applicationOverrides?.identity[key]);
  const rawProfile = clean(profileValue);
  const profile =
    rawProfile && (key === "firstName" || key === "lastName")
      ? normalizePersonalNameForEmployerPresentation(rawProfile)
      : rawProfile;
  return {
    value: applicationSpecific ?? profile,
    provenance: applicationSpecific
      ? [
          {
            source: "APPLICATION_OVERRIDE" as const,
            label: "Application-specific candidate answer",
          },
        ]
      : profile
        ? [
            source.profileProvenance ?? {
              source: "CANDIDATE_PROFILE" as const,
              label: "Career Profile",
            },
          ]
        : [],
    alternatives:
      applicationSpecific &&
      profile &&
      applicationSpecific.toLocaleLowerCase("en-US") !==
        profile.toLocaleLowerCase("en-US")
        ? [profile]
        : [],
  };
}

export function buildApplicationPacket(input: {
  readonly source: ApplicationPacketSource;
  readonly reviewed: boolean;
  readonly now?: Date;
  readonly reviewInvalidatedReason?:
    "MATERIAL_REQUIRED_QUESTION_SCHEMA_CHANGED" | null;
}): ApplicationPacket {
  const now = input.now ?? new Date();
  const source = input.source;
  const firstNameValue = identityValue(
    source,
    "firstName",
    source.profile?.firstName,
  );
  const firstName = field(
    "firstName",
    "First name",
    true,
    firstNameValue.value,
    firstNameValue.provenance,
    firstNameValue.alternatives,
  );
  const lastNameValue = identityValue(
    source,
    "lastName",
    source.profile?.lastName,
  );
  const lastName = field(
    "lastName",
    "Last name",
    true,
    lastNameValue.value,
    lastNameValue.provenance,
    lastNameValue.alternatives,
  );
  const email = emailField(source);
  const phoneValue = identityValue(source, "phone", source.profile?.phone);
  const phone = field(
    "phone",
    "Phone",
    requiredByQuestions(source.questions, [/\b(?:phone|telephone)\b/iu]),
    phoneValue.value,
    phoneValue.provenance,
    phoneValue.alternatives,
  );
  const locationValue = identityValue(
    source,
    "location",
    source.profile?.location,
  );
  const location = field(
    "location",
    "City / location",
    requiredByQuestions(source.questions, [
      /\b(?:current[ _-]?)?(?:city|location|address)\b/iu,
    ]),
    locationValue.value,
    locationValue.provenance,
    locationValue.alternatives,
  );
  const countryValue = identityValue(
    source,
    "country",
    source.profile?.countryCode,
  );
  const country = field(
    "country",
    "Country",
    requiredByQuestions(source.questions, [/\b(?:country|country_code)\b/iu]),
    countryValue.value,
    countryValue.provenance,
    countryValue.alternatives,
  );
  const identity = [firstName, lastName, email, phone, location, country];
  const selectedResume = source.selectedResume;
  const resume: ApplicationPacketDocument = {
    kind: "RESUME",
    label: selectedResume?.tailored ? "Tailored résumé" : "Candidate résumé",
    fileName: selectedResume?.fileName ?? null,
    contentType: selectedResume?.contentType ?? null,
    storageKey: selectedResume?.storageKey ?? null,
    status: selectedResume
      ? input.reviewed
        ? "RESOLVED"
        : "UNRESOLVED"
      : "UNRESOLVED",
    provenance: selectedResume
      ? [
          {
            source: selectedResume.tailored
              ? "TAILORED_RESUME"
              : "CANDIDATE_DOCUMENT",
            label: selectedResume.tailored
              ? "Job-specific tailored résumé"
              : "Candidate-uploaded résumé",
          },
        ]
      : [],
    externalTransferStatus: selectedResume ? "NOT_ATTEMPTED" : "HUMAN_REQUIRED",
  };
  const documents = [resume];
  if (source.coverLetter)
    documents.push({
      kind: "COVER_LETTER",
      label: "Cover letter",
      fileName: source.coverLetter.fileName,
      contentType: source.coverLetter.contentType,
      storageKey: source.coverLetter.storageKey,
      status: input.reviewed ? "RESOLVED" : "UNRESOLVED",
      provenance: [
        { source: "GENERATED_ARTIFACT", label: "RoleProwl writing artifact" },
      ],
    });
  const answers = source.questions.map((question) =>
    packetFieldForQuestion(question, identity, source, now, input.reviewed),
  );
  const requiredFields = [
    ...identity.filter((candidate) => candidate.required),
    resume,
    ...answers.filter((answer) => answer.required),
  ];
  const reviewFields = [
    ...requiredFields,
    ...answers.filter(
      (answer) => answer.status === "CONFLICTING" && !answer.required,
    ),
  ];
  const needsReview = reviewFields.filter(
    (candidate) =>
      candidate.status === "UNRESOLVED" ||
      candidate.status === "CONFLICTING" ||
      candidate.status === "UNSUPPORTED",
  ).length;
  const resolved = [...identity, ...documents, ...answers].filter(
    (candidate) => candidate.status === "RESOLVED",
  ).length;
  const unsupported = [...identity, ...documents, ...answers].filter(
    (candidate) => candidate.status === "UNSUPPORTED",
  ).length;
  const humanSteps = [
    {
      label:
        "Complete CAPTCHA, employer authentication, or other human verification if presented.",
      status: "HUMAN_REQUIRED" as const,
    },
    ...(source.questionInspection !== "AVAILABLE"
      ? [
          {
            label:
              "Inspect employer questions that were not available through the public interface.",
            status: "HUMAN_REQUIRED" as const,
          },
        ]
      : []),
    ...answers
      .filter(
        (answer) =>
          answer.required &&
          answer.status === "CANDIDATE_REQUIRED_EXTERNAL" &&
          answer.classification !== "DOCUMENT",
      )
      .map((answer) => ({
        label: `Complete ${answer.label} on the employer form.`,
        status: "HUMAN_REQUIRED" as const,
      })),
  ];
  const transferFields: ApplicationFieldTransfer[] = [
    ...identity.map((candidate) => ({
      externalFieldId: candidate.key,
      label: candidate.label,
      packetFieldKey: candidate.key,
      status:
        candidate.status === "RESOLVED"
          ? ("NOT_ATTEMPTED" as const)
          : ("UNSUPPORTED" as const),
    })),
    ...answers.map((answer) => ({
      externalFieldId: answer.questionId,
      label: answer.label,
      packetFieldKey: answer.key,
      status:
        answer.status === "RESOLVED"
          ? ("NOT_ATTEMPTED" as const)
          : answer.status === "CANDIDATE_REQUIRED_EXTERNAL" &&
              answer.classification === "DOCUMENT" &&
              Boolean(answer.value)
            ? ("NOT_ATTEMPTED" as const)
            : answer.status === "CANDIDATE_REQUIRED_EXTERNAL"
              ? ("HUMAN_REQUIRED" as const)
              : ("UNSUPPORTED" as const),
    })),
  ];
  const professionalProvenance: ApplicationPacketProvenance[] = [];
  if (
    source.experience.length ||
    source.education.length ||
    source.credentials.length ||
    source.skills.length ||
    source.workAuthorization
  )
    professionalProvenance.push({
      source: "STRUCTURED_CAREER_PROFILE",
      label: "Career Profile",
    });
  if (source.verifiedResumeFacts.length)
    professionalProvenance.push({
      source: "VERIFIED_RESUME_FACT",
      label: "Accepted résumé facts",
    });
  return {
    version: APPLICATION_PACKET_VERSION,
    builtAt: now.toISOString(),
    reviewedAt: input.reviewed ? now.toISOString() : null,
    reviewInvalidatedReason: input.reviewInvalidatedReason ?? null,
    source: { name: source.sourceName, inspection: source.questionInspection },
    identity,
    professional: {
      targetRole: source.profile?.professionalTitle ?? source.targetRole,
      experience: [
        ...source.experience,
        ...source.verifiedResumeFacts
          .filter((fact) => fact.factType === "WORK_EXPERIENCE_TEXT")
          .map((fact) => fact.text),
      ],
      education: [
        ...source.education,
        ...source.verifiedResumeFacts
          .filter((fact) => fact.factType === "EDUCATION_TEXT")
          .map((fact) => fact.text),
      ],
      credentials: [
        ...source.credentials,
        ...source.verifiedResumeFacts
          .filter((fact) => fact.factType === "CREDENTIAL_TEXT")
          .map((fact) => fact.text),
      ],
      skills: [
        ...source.skills,
        ...source.verifiedResumeFacts
          .filter((fact) => fact.factType === "SKILL_TEXT")
          .map((fact) => fact.text),
      ],
      languages: source.languages,
      workAuthorization: source.workAuthorization,
      sponsorshipRequired: source.sponsorshipRequired,
      provenance: professionalProvenance,
    },
    documents,
    answers,
    completeness: {
      known: resolved,
      ready: requiredFields.filter(
        (candidate) => candidate.status === "RESOLVED",
      ).length,
      needsReview,
      humanRequired:
        humanSteps.length +
        answers.filter(
          (answer) =>
            answer.required &&
            answer.status === "CANDIDATE_REQUIRED_EXTERNAL" &&
            answer.classification === "DOCUMENT" &&
            !answer.value,
        ).length,
      unsupported,
      readyForSubmissionHandoff:
        input.reviewed &&
        needsReview === 0 &&
        (source.sourceName !== "GREENHOUSE" ||
          source.questionInspection === "AVAILABLE"),
    },
    transfer: {
      mechanism: "MANUAL_ASSISTED",
      status: "NOT_ATTEMPTED",
      fields: transferFields,
      humanSteps,
    },
  };
}

export function isApplicationPacket(
  value: unknown,
): value is ApplicationPacket {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { version?: unknown }).version === APPLICATION_PACKET_VERSION,
  );
}

export function applicationPacketCanBeReviewed(packet: ApplicationPacket) {
  const requiredFields = [...packet.identity, ...packet.answers].filter(
    (field) => field.required,
  );
  const resume = packet.documents.find(
    (document) => document.kind === "RESUME",
  );
  return Boolean(
    (packet.source.name !== "GREENHOUSE" ||
      packet.source.inspection === "AVAILABLE") &&
    resume?.storageKey &&
    requiredFields.every(
      (field) =>
        field.status === "RESOLVED" ||
        field.status === "CANDIDATE_REQUIRED_EXTERNAL",
    ),
  );
}

export function applicationTransferStatus(
  fields: readonly ApplicationFieldTransfer[],
): ApplicationTransferStatus {
  if (fields.some((field) => field.status === "FAILED")) return "FAILED";
  if (fields.some((field) => field.status === "HUMAN_REQUIRED"))
    return "HUMAN_REQUIRED";
  const attempted = fields.filter(
    (field) =>
      field.status !== "UNSUPPORTED" && field.status !== "NOT_ATTEMPTED",
  );
  if (!attempted.length) return "NOT_ATTEMPTED";
  if (attempted.every((field) => field.status === "VERIFIED"))
    return "VERIFIED";
  return "TRANSFERRED";
}
