import type { AIProvider } from "@/core/contracts/ai-provider";
import { decideAnswerAuthority } from "@/core/domain/applications/answer-authority";
import type {
  PreparedApplicationQuestion,
  PublicApplicationQuestion,
  PublicApplicationQuestionGroup,
  PublicApplicationQuestionReference,
} from "@/core/domain/applications/public-application-question";
import type { QuestionClassificationResult } from "@/core/domain/applications/question-classifier";
import { classifyApplicationQuestion } from "@/features/applications/classify-application-question";
import type { CanonicalPersonalCandidate } from "./personal-candidate";
import type { PersonalStateJob } from "./personal-state";

export type PersonalQuestionFetch = (
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
          if (!value || typeof value !== "object") return [];
          const label = (value as Record<string, unknown>).label;
          return typeof label === "string" && label.trim()
            ? [label.trim()]
            : [];
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
    const names = fields.flatMap((field) =>
      typeof field.name === "string" && field.name.trim()
        ? [field.name.trim()]
        : [],
    );
    return [
      {
        id: `${prefix}:${names.join(",") || index + 1}`,
        source: "GREENHOUSE" as const,
        group,
        label: question.label.trim(),
        required: question.required === true,
        fieldTypes,
        options: [...new Set(parseOptions(fields))],
      },
    ];
  });
}

export function parseGreenhouseApplicationQuestions(payload: unknown) {
  if (!payload || typeof payload !== "object")
    throw new Error("Greenhouse question response is invalid.");
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

async function fetchGreenhouseQuestions(
  reference: PublicApplicationQuestionReference,
  request: PersonalQuestionFetch,
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
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Greenhouse questions returned HTTP ${response.status}.`);
    return parseGreenhouseApplicationQuestions(await response.json());
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Greenhouse question request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function evidenceForQuestion(
  question: PublicApplicationQuestion,
  candidate: CanonicalPersonalCandidate,
) {
  const label = question.label.toLocaleLowerCase("en-US");
  if (/\b(?:current )?location|address\b/u.test(label))
    return candidate.evidence.filter((entry) => entry.kind === "LOCATION");
  if (/\bauthorized|authorization|sponsorship|visa\b/u.test(label))
    return candidate.evidence.filter(
      (entry) => entry.kind === "WORK_AUTHORIZATION",
    );
  return candidate.evidence.filter(
    (entry) =>
      entry.kind === "SKILL" &&
      label.includes(entry.label.toLocaleLowerCase("en-US")),
  );
}

function forcedSensitiveClassification(): QuestionClassificationResult {
  return {
    classification: "SENSITIVE_PERSONAL_DATA",
    confidence: 1,
    rationaleCode: "ATS_COMPLIANCE_OR_DEMOGRAPHIC_GROUP",
    source: "DETERMINISTIC",
  };
}

function actionFor(
  classification: QuestionClassificationResult["classification"],
  hasEvidence: boolean,
) {
  if (
    classification === "SENSITIVE_PERSONAL_DATA" ||
    classification === "LEGAL_OR_CONSEQUENTIAL" ||
    classification === "ATTESTATION"
  )
    return "User confirmation required; RoleProwl will not infer or answer this question.";
  if (classification === "JOB_SPECIFIC_FREE_TEXT")
    return "Prepare a grounded draft, then review and answer manually.";
  if (hasEvidence)
    return "Candidate evidence is available; verify it before answering manually.";
  return "User input required; no supported candidate evidence was found.";
}

export async function retrieveAndPrepareApplicationQuestions(input: {
  readonly ai?: AIProvider;
  readonly candidate: CanonicalPersonalCandidate;
  readonly job: PersonalStateJob;
  readonly request?: PersonalQuestionFetch;
}) {
  const references = input.job.snapshot.sources.flatMap((source) =>
    source.questionReference ? [source.questionReference] : [],
  );
  const unique = new Map(
    references.map((reference) => [
      `${reference.source}:${reference.boardToken}:${reference.jobId}`,
      reference,
    ]),
  );
  const questions: PublicApplicationQuestion[] = [];
  for (const reference of unique.values())
    questions.push(
      ...(await fetchGreenhouseQuestions(reference, input.request ?? fetch)),
    );

  const prepared: PreparedApplicationQuestion[] = [];
  for (const question of questions) {
    const classificationResult =
      question.group === "COMPLIANCE" || question.group === "DEMOGRAPHIC"
        ? forcedSensitiveClassification()
        : await classifyApplicationQuestion({
            ai: input.ai,
            correlationId: `personal-question-${input.job.id}-${question.id}`,
            question: question.label,
            userId: "local-personal-mode",
          });
    const evidence = evidenceForQuestion(question, input.candidate);
    const answer =
      classificationResult.classification === "PROFILE_FACT" && evidence.length
        ? { memoryStatus: "FRESH" as const, source: "PROFILE_FACT" as const }
        : null;
    const authority = decideAnswerAuthority({
      answer,
      classification: classificationResult.classification,
    });
    prepared.push({
      ...question,
      classification: classificationResult.classification,
      classificationResult,
      disposition: authority.disposition,
      handling: authority.handling,
      authorityReasonCode: authority.reasonCode,
      candidateEvidence: evidence.map((entry) => ({
        label: entry.label,
        quote: entry.quote,
      })),
      suggestedAction: actionFor(
        classificationResult.classification,
        evidence.length > 0,
      ),
    });
  }
  return prepared;
}

function safeMarkdown(value: string) {
  return value.replace(/[\\`*_[\]<>#]/gu, "\\$&").trim();
}

export function renderApplicationQuestionsMarkdown(
  questions: readonly PreparedApplicationQuestion[],
) {
  const lines = [
    "# Public Application Questions",
    "",
    "> Retrieved from a documented public ATS endpoint. Review every question manually; no answer was submitted.",
    "",
  ];
  for (const [index, question] of questions.entries()) {
    lines.push(
      `## ${index + 1}. ${safeMarkdown(question.label)}`,
      "",
      `- **Required:** ${question.required ? "Yes" : "No"}`,
      `- **Source/group:** ${question.source} / ${question.group}`,
      `- **Classification:** ${question.classification}`,
      `- **Handling:** ${question.disposition} / ${question.handling}`,
      `- **Suggested action:** ${question.suggestedAction}`,
    );
    if (question.options.length)
      lines.push(
        `- **Published options:** ${question.options.map(safeMarkdown).join("; ")}`,
      );
    if (question.candidateEvidence.length) {
      lines.push("- **Candidate evidence:**");
      for (const evidence of question.candidateEvidence)
        lines.push(
          `  - ${safeMarkdown(evidence.label)}: “${safeMarkdown(evidence.quote)}”`,
        );
    } else lines.push("- **Candidate evidence:** None located.");
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}
