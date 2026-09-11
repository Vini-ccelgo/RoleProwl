import type { AIProvider } from "@/core/contracts/ai-provider";
import {
  claimCanPassReadiness,
  classifyGeneratedClaim,
  type ClaimAssertion,
  type ClaimEvidenceInput,
} from "@/core/domain/claims/provenance";
import {
  AIInvalidOutputError,
  ValidationError,
} from "@/core/errors/application-errors";
import { aiTaskDefinitions } from "@/features/ai/task-definitions";
import { logger } from "@/lib/logging/logger";

export const APPLICATION_WRITING_TYPES = [
  "COVER_LETTER",
  "MOTIVATION_RESPONSE",
  "ROLE_SUMMARY",
  "EMPLOYER_FREE_TEXT",
] as const;
export type ApplicationWritingType = (typeof APPLICATION_WRITING_TYPES)[number];

export const APPLICATION_WRITING_REJECTION_REASONS = [
  "FABRICATED_EMPLOYER_ATTACHMENT",
  "CLAIM_NOT_IN_CONTENT",
  "MODEL_MARKED_UNSUPPORTED",
  "UNKNOWN_EVIDENCE",
  "PROVENANCE_VALIDATION_FAILED",
] as const;
export type ApplicationWritingRejectionReason =
  (typeof APPLICATION_WRITING_REJECTION_REASONS)[number];

class ApplicationWritingInvalidOutputError extends AIInvalidOutputError {
  constructor(
    readonly rejectionReason: ApplicationWritingRejectionReason,
    message: string,
  ) {
    super(message);
  }
}

function rejectApplicationWriting(
  rejectionReason: ApplicationWritingRejectionReason,
  message: string,
): never {
  throw new ApplicationWritingInvalidOutputError(rejectionReason, message);
}

export interface WritingEvidence extends ClaimEvidenceInput {
  readonly label: string;
}

const IGNORED_RELEVANCE_TOKENS = new Set([
  "and",
  "are",
  "candidate",
  "company",
  "experience",
  "for",
  "from",
  "have",
  "job",
  "our",
  "position",
  "preferred",
  "required",
  "requirement",
  "requirements",
  "role",
  "skill",
  "skills",
  "that",
  "the",
  "their",
  "this",
  "team",
  "with",
  "work",
  "working",
  "you",
  "your",
]);

function searchableValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(searchableValues);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(searchableValues);
  return typeof value === "string" || typeof value === "number"
    ? [String(value)]
    : [];
}

function searchableTokens(value: unknown) {
  return new Set(
    searchableValues(value)
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[a-z0-9+#.]{2,}/gu)
      ?.filter((token) => !IGNORED_RELEVANCE_TOKENS.has(token)) ?? [],
  );
}

export function selectRelevantWritingEvidence(
  evidence: readonly WritingEvidence[],
  jobContext: Readonly<Record<string, unknown>>,
) {
  const target = searchableTokens(jobContext);
  return evidence
    .map((item, index) => ({
      index,
      item,
      score: [...searchableTokens(item.snapshot)].filter((token) =>
        target.has(token),
      ).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 30)
    .map(({ item }) => item);
}

export interface ValidatedWritingClaim {
  readonly assertions: readonly ClaimAssertion[];
  readonly classification:
    "DIRECT_FACT" | "SUPPORTED_REWRITE" | "SUPPORTED_INFERENCE";
  readonly evidence: readonly ClaimEvidenceInput[];
  readonly text: string;
}

export interface ApplicationWritingRepository {
  save(input: {
    readonly claims: readonly ValidatedWritingClaim[];
    readonly content: string;
    readonly generator: string;
    readonly promptVersion: string;
    readonly question: string | null;
    readonly targetJobId: string;
    readonly type: ApplicationWritingType;
    readonly userId: string;
  }): Promise<{ readonly id: string }>;
}

function validateClaims(
  content: string,
  claims: readonly {
    text: string;
    classification:
      | "DIRECT_FACT"
      | "SUPPORTED_REWRITE"
      | "SUPPORTED_INFERENCE"
      | "UNSUPPORTED";
    assertions: readonly ClaimAssertion[];
    sourceEvidence: readonly {
      evidenceType: string;
      evidenceId: string;
      evidenceField: string;
    }[];
  }[],
  evidence: readonly WritingEvidence[],
) {
  const byKey = new Map(
    evidence.map((item) => [
      `${item.evidenceType}:${item.evidenceId}:${item.evidenceField}`,
      item,
    ]),
  );
  return claims.map((claim): ValidatedWritingClaim => {
    if (!content.includes(claim.text))
      rejectApplicationWriting(
        "CLAIM_NOT_IN_CONTENT",
        "A writing claim is not present in the generated content.",
      );
    if (claim.classification === "UNSUPPORTED")
      rejectApplicationWriting(
        "MODEL_MARKED_UNSUPPORTED",
        "Unsupported claims cannot enter application writing.",
      );
    const linked = claim.sourceEvidence.map((reference) => {
      const item = byKey.get(
        `${reference.evidenceType}:${reference.evidenceId}:${reference.evidenceField}`,
      );
      if (!item)
        rejectApplicationWriting(
          "UNKNOWN_EVIDENCE",
          "Application writing cited unknown evidence.",
        );
      return item;
    });
    const classification = classifyGeneratedClaim({
      assertions: claim.assertions,
      evidence: linked,
      intendedClassification: claim.classification,
    });
    if (!claimCanPassReadiness(classification, linked.length))
      rejectApplicationWriting(
        "PROVENANCE_VALIDATION_FAILED",
        "An application-writing claim failed provenance validation.",
      );
    if (classification === "UNSUPPORTED")
      rejectApplicationWriting(
        "PROVENANCE_VALIDATION_FAILED",
        "An application-writing claim was classified as unsupported.",
      );
    return { ...claim, classification, evidence: linked };
  });
}

export function hasFabricatedEmployerAttachment(
  content: string,
  company: string,
) {
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(?:always (?:dreamed|wanted)|long admired|lifelong (?:fan|dream)).{0,80}${escaped}`,
    "iu",
  ).test(content);
}

export async function generateApplicationWriting(input: {
  readonly ai: AIProvider;
  readonly company: string;
  readonly correlationId: string;
  readonly evidence: readonly WritingEvidence[];
  readonly jobContext: Readonly<Record<string, unknown>>;
  readonly preferences: Readonly<Record<string, unknown>> | null;
  readonly question?: string | null;
  readonly repository: ApplicationWritingRepository;
  readonly targetJobId: string;
  readonly type: ApplicationWritingType;
  readonly userId: string;
}) {
  if (input.evidence.length === 0)
    throw new ValidationError(
      "Candidate evidence is required for application writing.",
    );
  if (input.type === "EMPLOYER_FREE_TEXT" && !input.question?.trim())
    throw new ValidationError(
      "An employer question is required for free-text writing.",
    );
  const taskInput = {
    writingType: input.type,
    question: input.question ?? null,
    job: input.jobContext,
    preferences: input.preferences,
    evidence: input.evidence.map(
      ({ evidenceType, evidenceId, evidenceField, label, snapshot }) => ({
        evidenceType,
        evidenceId,
        evidenceField,
        label,
        snapshot,
      }),
    ),
  };
  const generated =
    input.type === "COVER_LETTER"
      ? await (async () => {
          const definition = aiTaskDefinitions.COVER_LETTER_GENERATION;
          const result = await input.ai.generateStructured({
            correlationId: input.correlationId,
            dataClassification: "REAL_CANDIDATE",
            rateLimitSubject: input.userId,
            input: taskInput,
            ...definition,
            task: "COVER_LETTER_GENERATION",
          });
          return {
            content: result.data.body,
            claims: result.data.claims,
            metadata: result.metadata,
            promptVersion: definition.promptVersion,
          };
        })()
      : await (async () => {
          const definition = aiTaskDefinitions.FREE_TEXT_APPLICATION_GENERATION;
          const result = await input.ai.generateStructured({
            correlationId: input.correlationId,
            dataClassification: "REAL_CANDIDATE",
            rateLimitSubject: input.userId,
            input: taskInput,
            ...definition,
            task: "FREE_TEXT_APPLICATION_GENERATION",
          });
          return {
            content: result.data.text,
            claims: result.data.claims,
            metadata: result.metadata,
            promptVersion: definition.promptVersion,
          };
        })();
  const content = generated.content;
  let claims: readonly ValidatedWritingClaim[];
  try {
    if (hasFabricatedEmployerAttachment(content, input.company)) {
      rejectApplicationWriting(
        "FABRICATED_EMPLOYER_ATTACHMENT",
        "Fabricated personal attachment to an employer is not allowed.",
      );
    }
    claims = validateClaims(content, generated.claims, input.evidence);
  } catch (error) {
    if (error instanceof ApplicationWritingInvalidOutputError) {
      logger.log("warn", "application_writing_rejected", {
        correlationId: input.correlationId,
        writingType: input.type,
        rejectionReason: error.rejectionReason,
        task:
          input.type === "COVER_LETTER"
            ? "COVER_LETTER_GENERATION"
            : "FREE_TEXT_APPLICATION_GENERATION",
      });
    }
    throw error;
  }
  const saved = await input.repository.save({
    claims,
    content,
    generator: generated.metadata.model,
    promptVersion: generated.promptVersion,
    question: input.question?.trim() || null,
    targetJobId: input.targetJobId,
    type: input.type,
    userId: input.userId,
  });
  return { ...saved, content, claims };
}
