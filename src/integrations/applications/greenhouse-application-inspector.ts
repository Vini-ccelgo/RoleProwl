import "server-only";
import type {
  PublicApplicationQuestion,
  PublicApplicationQuestionGroup,
  PublicApplicationQuestionReference,
} from "@/core/domain/applications/public-application-question";
import {
  IntegrationError,
  ValidationError,
} from "@/core/errors/application-errors";

export type GreenhouseQuestionFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

interface GreenhouseField {
  readonly name?: unknown;
  readonly type?: unknown;
  readonly values?: unknown;
}

interface GreenhouseQuestion {
  readonly required?: unknown;
  readonly label?: unknown;
  readonly fields?: unknown;
}

function parseOptions(fields: readonly GreenhouseField[]) {
  return fields.flatMap((field) =>
    Array.isArray(field.values)
      ? field.values.flatMap((value) => {
          if (typeof value === "string" && value.trim()) return [value.trim()];
          if (!value || typeof value !== "object") return [];
          const option = value as Record<string, unknown>;
          const label =
            typeof option.label === "string" && option.label.trim()
              ? option.label
              : typeof option.value === "string" && option.value.trim()
                ? option.value
                : null;
          return label ? [label.trim()] : [];
        })
      : [],
  );
}

function parseQuestionGroup(
  value: unknown,
  group: PublicApplicationQuestionGroup,
  prefix: string,
): PublicApplicationQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const question = entry as GreenhouseQuestion;
    if (typeof question.label !== "string" || !question.label.trim()) return [];
    const fields = Array.isArray(question.fields)
      ? question.fields.filter((field): field is GreenhouseField =>
          Boolean(field && typeof field === "object"),
        )
      : [];
    const fieldTypes = fields.flatMap((field) =>
      typeof field.type === "string" && field.type !== "input_hidden"
        ? [field.type]
        : [],
    );
    if (fields.length && !fieldTypes.length) return [];
    const fieldNames = fields.flatMap((field) =>
      typeof field.name === "string" && field.name.trim()
        ? [field.name.trim()]
        : [],
    );
    return [
      {
        id: `${prefix}:${fieldNames.join(",") || index + 1}`,
        source: "GREENHOUSE" as const,
        group,
        label: question.label.trim(),
        required: question.required === true,
        fieldNames,
        fieldTypes,
        options: [...new Set(parseOptions(fields))],
      },
    ];
  });
}

export function parseGreenhouseApplicationQuestions(payload: unknown) {
  if (!payload || typeof payload !== "object")
    throw new IntegrationError("Greenhouse question response is invalid.");
  const data = payload as Record<string, unknown>;
  const compliance = Array.isArray(data.compliance)
    ? data.compliance.flatMap((entry, index) =>
        entry && typeof entry === "object"
          ? parseQuestionGroup(
              (entry as Record<string, unknown>).questions,
              "COMPLIANCE",
              `compliance:${index + 1}`,
            )
          : [],
      )
    : [];
  const demographic =
    data.demographic_questions && typeof data.demographic_questions === "object"
      ? parseQuestionGroup(
          (data.demographic_questions as Record<string, unknown>).questions,
          "DEMOGRAPHIC",
          "demographic",
        )
      : [];
  return [
    ...parseQuestionGroup(data.questions, "STANDARD", "standard"),
    ...parseQuestionGroup(data.location_questions, "LOCATION", "location"),
    ...compliance,
    ...demographic,
  ];
}

export async function fetchGreenhouseApplicationQuestions(
  reference: PublicApplicationQuestionReference,
  request: GreenhouseQuestionFetch = fetch,
) {
  const url = new URL(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(reference.boardToken)}/jobs/${encodeURIComponent(reference.jobId)}`,
  );
  url.searchParams.set("questions", "true");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await request(url.toString(), {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new IntegrationError(
        `Greenhouse questions returned HTTP ${response.status}.`,
      );
    return parseGreenhouseApplicationQuestions(await response.json());
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new IntegrationError(
        "Greenhouse question request timed out.",
        error,
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function greenhouseQuestionReference(input: {
  readonly externalId: string;
  readonly source: string;
  readonly applicationUrl: string | null;
}): PublicApplicationQuestionReference | null {
  if (input.source !== "GREENHOUSE" || !input.applicationUrl) return null;
  let url: URL;
  try {
    url = new URL(input.applicationUrl);
  } catch {
    throw new ValidationError("The Greenhouse application URL is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    !["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)
  )
    return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const jobsIndex = segments.findIndex((segment) => segment === "jobs");
  const boardToken = jobsIndex > 0 ? segments[jobsIndex - 1] : segments[0];
  if (!boardToken || !/^[a-zA-Z0-9_-]+$/u.test(boardToken)) return null;
  return { source: "GREENHOUSE", boardToken, jobId: input.externalId };
}
