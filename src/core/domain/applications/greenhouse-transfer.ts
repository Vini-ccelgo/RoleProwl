import {
  applicationAnswerValues,
  type ApplicationPacket,
} from "./application-packet";
import { ValidationError } from "@/core/errors/application-errors";

export const GREENHOUSE_TRANSFER_VERSION = "greenhouse-assisted-v1";

export interface GreenhouseTransferField {
  readonly id: string;
  readonly label: string;
  readonly value: string | readonly string[];
  readonly fieldNames: readonly string[];
  readonly fieldTypes: readonly string[];
  readonly options: readonly string[];
  readonly optionIdentities?: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly kind: "TEXT" | "CHOICE" | "DOCUMENT" | "HUMAN_REQUIRED";
}

export interface GreenhouseTransferDraft {
  readonly version: typeof GREENHOUSE_TRANSFER_VERSION;
  readonly destination: string;
  readonly fields: readonly GreenhouseTransferField[];
  readonly resumeContentType: string | null;
  readonly resumeFileName: string | null;
}

const IDENTITY_FIELD_NAMES: Readonly<Record<string, readonly string[]>> = {
  firstName: ["first_name", "job_application[first_name]"],
  lastName: ["last_name", "job_application[last_name]"],
  email: ["email", "job_application[email]"],
  phone: ["phone", "phone_number", "job_application[phone]"],
  location: [
    "candidate-location",
    "location",
    "city",
    "job_application[location]",
  ],
  country: ["country", "country_code", "job_application[country]"],
};

function greenhouseDestination(value: string) {
  let destination: URL;
  try {
    destination = new URL(value);
  } catch {
    throw new ValidationError("The Greenhouse destination is invalid.");
  }
  if (
    destination.protocol !== "https:" ||
    destination.username ||
    destination.password ||
    !["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(
      destination.hostname,
    )
  )
    throw new ValidationError(
      "Assisted transfer is restricted to official Greenhouse job-board pages.",
    );
  destination.hash = "";
  return destination.toString();
}

export function buildGreenhouseTransferDraft(input: {
  readonly packet: ApplicationPacket;
  readonly destination: string;
}): GreenhouseTransferDraft {
  if (input.packet.source.name !== "GREENHOUSE")
    throw new ValidationError(
      "Assisted transfer is currently available only for Greenhouse applications.",
    );
  if (!input.packet.completeness.readyForSubmissionHandoff)
    throw new ValidationError(
      "Review and complete the current packet before assisted transfer.",
    );
  const identity = input.packet.identity.flatMap((field) =>
    field.status === "RESOLVED" &&
    field.value &&
    IDENTITY_FIELD_NAMES[field.key]
      ? [
          {
            id: `identity:${field.key}`,
            label: field.label,
            value: field.value,
            fieldNames: IDENTITY_FIELD_NAMES[field.key],
            fieldTypes: ["input_text"],
            options: [],
            kind: "TEXT" as const,
          },
        ]
      : [],
  );
  const projectedIdentityKeys = new Set(
    identity.map((field) => field.id.slice("identity:".length)),
  );
  const canonicalIdentityKey = (fieldNames: readonly string[]) =>
    Object.entries(IDENTITY_FIELD_NAMES).find(([, aliases]) =>
      fieldNames.some((fieldName) =>
        aliases.some(
          (alias) =>
            fieldName.trim().toLocaleLowerCase("en-US") ===
            alias.toLocaleLowerCase("en-US"),
        ),
      ),
    )?.[0];
  const answers: GreenhouseTransferField[] = input.packet.answers.flatMap(
    (answer): GreenhouseTransferField[] => {
      if (
        answer.status === "CANDIDATE_REQUIRED_EXTERNAL" &&
        answer.classification === "DOCUMENT" &&
        answer.value
      )
        return [
          {
            id: `answer:${answer.questionId}`,
            label: answer.label,
            value: answer.value,
            fieldNames: answer.fieldNames,
            fieldTypes: answer.fieldTypes,
            options: answer.options,
            optionIdentities: answer.optionIdentities,
            kind: "DOCUMENT",
          },
        ];
      if (
        answer.status === "CANDIDATE_REQUIRED_EXTERNAL" &&
        answer.classification !== "DOCUMENT"
      )
        return [
          {
            id: `answer:${answer.questionId}`,
            label: answer.label,
            value: answer.value ?? "",
            fieldNames: answer.fieldNames,
            fieldTypes: answer.fieldTypes,
            options: answer.options,
            optionIdentities: answer.optionIdentities,
            kind: "HUMAN_REQUIRED",
          },
        ];
      if (
        answer.status !== "RESOLVED" ||
        !answer.value ||
        (["STANDARD", "LOCATION"].includes(answer.questionGroup ?? "") &&
          projectedIdentityKeys.has(
            canonicalIdentityKey(answer.fieldNames) ?? "",
          ))
      )
        return [];
      return [
        {
          id: `answer:${answer.questionId}`,
          label: answer.label,
          fieldNames: answer.fieldNames,
          fieldTypes: answer.fieldTypes,
          options: answer.options,
          optionIdentities: answer.optionIdentities,
          kind: answer.fieldTypes.some((type) => type === "input_file")
            ? "DOCUMENT"
            : answer.options.length
              ? "CHOICE"
              : "TEXT",
          value: answer.fieldTypes.includes("multi_value_multi_select")
            ? applicationAnswerValues(answer.value)
            : answer.value,
        },
      ];
    },
  );
  const resume = input.packet.documents.find(
    (document) => document.kind === "RESUME",
  );
  return {
    version: GREENHOUSE_TRANSFER_VERSION,
    destination: greenhouseDestination(input.destination),
    fields: [...identity, ...answers],
    resumeContentType: resume?.contentType ?? null,
    resumeFileName: resume?.fileName ?? null,
  };
}
