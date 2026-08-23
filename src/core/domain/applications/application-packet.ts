import { answerMemoryStatus } from "./answer-memory";
import { mapQuestionToAnswerConcept } from "./answer-memory";
import type { PublicApplicationQuestion } from "./public-application-question";

export const APPLICATION_PACKET_VERSION = "application-packet-v1";

export type ApplicationFieldStatus =
  "RESOLVED" | "UNRESOLVED" | "CONFLICTING" | "NOT_REQUIRED" | "UNSUPPORTED";

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
}

export interface ApplicationPacketAnswer extends ApplicationPacketField {
  readonly questionId: string;
  readonly classification: string;
  readonly fieldNames: readonly string[];
  readonly fieldTypes: readonly string[];
  readonly options: readonly string[];
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
  readonly questionInspection: "AVAILABLE" | "UNAVAILABLE" | "UNSUPPORTED";
  readonly sourceName: string;
  readonly targetRole: string;
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
      [{ source: "CANDIDATE_PROFILE", label: "Application email" }],
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
  const applicationSpecific = clean(
    source.applicationOverrides?.answers[question.id],
  );
  if (applicationSpecific)
    return {
      key: `question:${question.id}`,
      questionId: question.id,
      label: question.label,
      required: question.required,
      status: "RESOLVED",
      value: applicationSpecific,
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
    };
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
  if (identityField)
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
      classification: "PROFILE_FACT",
      fieldNames: question.fieldNames,
      fieldTypes: question.fieldTypes,
      options: question.options,
    };

  if (/\b(?:resume|résumé|cv)\b/iu.test(searchable)) {
    const selected = source.selectedResume;
    return {
      key: `question:${question.id}`,
      questionId: question.id,
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
  };
}

function identityValue(
  source: ApplicationPacketSource,
  key: ApplicationIdentityKey,
  profileValue: string | null | undefined,
) {
  const applicationSpecific = clean(source.applicationOverrides?.identity[key]);
  const profile = clean(profileValue);
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
            {
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
  const needsReview = requiredFields.filter(
    (candidate) =>
      candidate.status === "UNRESOLVED" || candidate.status === "CONFLICTING",
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
      humanRequired: humanSteps.length,
      unsupported,
      readyForSubmissionHandoff: input.reviewed && needsReview === 0,
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
    resume?.storageKey &&
    requiredFields.every(
      (field) =>
        field.status === "RESOLVED" ||
        ("classification" in field &&
          field.classification === "DOCUMENT" &&
          Boolean(field.value)),
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
