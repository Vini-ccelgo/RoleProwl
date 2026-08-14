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

export const APPLICATION_WRITING_TYPES = [
  "COVER_LETTER",
  "MOTIVATION_RESPONSE",
  "ROLE_SUMMARY",
  "EMPLOYER_FREE_TEXT",
] as const;
export type ApplicationWritingType = (typeof APPLICATION_WRITING_TYPES)[number];

export interface WritingEvidence extends ClaimEvidenceInput {
  readonly label: string;
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
      throw new AIInvalidOutputError(
        "A writing claim is not present in the generated content.",
      );
    if (claim.classification === "UNSUPPORTED")
      throw new AIInvalidOutputError(
        "Unsupported claims cannot enter application writing.",
      );
    const linked = claim.sourceEvidence.map((reference) => {
      const item = byKey.get(
        `${reference.evidenceType}:${reference.evidenceId}:${reference.evidenceField}`,
      );
      if (!item)
        throw new AIInvalidOutputError(
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
      throw new AIInvalidOutputError(
        "An application-writing claim failed provenance validation.",
      );
    if (classification === "UNSUPPORTED")
      throw new AIInvalidOutputError(
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
  if (hasFabricatedEmployerAttachment(content, input.company)) {
    throw new AIInvalidOutputError(
      "Fabricated personal attachment to an employer is not allowed.",
    );
  }
  const claims = validateClaims(content, generated.claims, input.evidence);
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
