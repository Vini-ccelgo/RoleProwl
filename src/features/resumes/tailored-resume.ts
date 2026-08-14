import type { AIProvider } from "@/core/contracts/ai-provider";
import {
  claimCanPassReadiness,
  classifyGeneratedClaim,
  type ClaimAssertion,
  type ClaimEvidenceInput,
} from "@/core/domain/claims/provenance";
import { AIInvalidOutputError } from "@/core/errors/application-errors";
import { aiTaskDefinitions } from "@/features/ai/task-definitions";

export const RESUME_TEMPLATE_VERSION = "roleprowl-classic-v1";

export interface ResumeEvidence extends ClaimEvidenceInput {
  readonly label: string;
  readonly searchableText: string;
}

export interface ResumeTargetJob {
  readonly company: string;
  readonly description: string | null;
  readonly id: string;
  readonly requirements: readonly string[];
  readonly title: string;
}

export interface ValidatedResumeClaim {
  readonly assertions: readonly ClaimAssertion[];
  readonly classification:
    "DIRECT_FACT" | "SUPPORTED_REWRITE" | "SUPPORTED_INFERENCE";
  readonly evidence: readonly ClaimEvidenceInput[];
  readonly text: string;
}

export interface TailoredResumeContent {
  readonly headline: string;
  readonly summary: string;
  readonly sections: readonly {
    readonly heading: string;
    readonly bullets: readonly string[];
  }[];
}

export interface ResumeArtifactRepository {
  save(input: {
    readonly claims: readonly ValidatedResumeClaim[];
    readonly content: TailoredResumeContent;
    readonly generator: string;
    readonly promptVersion: string;
    readonly renderedContentType: string;
    readonly renderedFileName: string;
    readonly renderedStorageKey: string;
    readonly targetJobId: string;
    readonly templateVersion: string;
    readonly userId: string;
  }): Promise<{ readonly id: string }>;
}

export interface ResumeDocumentRenderer {
  render(content: TailoredResumeContent): Promise<Uint8Array>;
}

export interface ResumeObjectStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<unknown>;
}

function tokens(value: string) {
  return new Set(
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[a-z0-9+#.]{2,}/gu) ?? [],
  );
}

export function selectRelevantResumeEvidence(
  evidence: readonly ResumeEvidence[],
  job: ResumeTargetJob,
) {
  const target = tokens(
    [job.title, job.company, job.description, ...job.requirements]
      .filter(Boolean)
      .join(" "),
  );
  return [...evidence]
    .map((item) => ({
      item,
      score: [...tokens(item.searchableText)].filter((token) =>
        target.has(token),
      ).length,
    }))
    .sort((left, right) => right.score - left.score)
    .filter(({ score }, index) => score > 0 || index < 6)
    .slice(0, 30)
    .map(({ item }) => item);
}

function materialStatements(content: TailoredResumeContent) {
  return [
    content.headline,
    content.summary,
    ...content.sections.flatMap(({ bullets }) => bullets),
  ].filter((statement) => statement.trim().length > 0);
}

function validateOutput(
  parsed: ReturnType<typeof aiTaskDefinitions.RESUME_TAILORING.schema.parse>,
  evidence: readonly ResumeEvidence[],
) {
  const evidenceByKey = new Map(
    evidence.map((item) => [
      `${item.evidenceType}:${item.evidenceId}:${item.evidenceField}`,
      item,
    ]),
  );
  const claims: ValidatedResumeClaim[] = parsed.claims.map((claim) => {
    const linked = claim.sourceEvidence.map((reference) => {
      const item = evidenceByKey.get(
        `${reference.evidenceType}:${reference.evidenceId}:${reference.evidenceField}`,
      );
      if (!item)
        throw new AIInvalidOutputError(
          "A resume claim cited unknown evidence.",
        );
      return item;
    });
    if (claim.classification === "UNSUPPORTED") {
      throw new AIInvalidOutputError(
        "An unsupported claim cannot enter a resume.",
      );
    }
    const classification = classifyGeneratedClaim({
      assertions: claim.assertions,
      evidence: linked,
      intendedClassification: claim.classification,
    });
    if (!claimCanPassReadiness(classification, linked.length)) {
      throw new AIInvalidOutputError(
        "A resume claim failed provenance validation.",
      );
    }
    return {
      ...claim,
      classification,
      evidence: linked,
    } as ValidatedResumeClaim;
  });
  const claimTexts = new Set(claims.map(({ text }) => text.trim()));
  if (
    materialStatements(parsed).some(
      (statement) => !claimTexts.has(statement.trim()),
    )
  ) {
    throw new AIInvalidOutputError(
      "Every material resume statement must have a provenance-bearing claim.",
    );
  }
  return {
    content: {
      headline: parsed.headline,
      summary: parsed.summary,
      sections: parsed.sections,
    },
    claims,
  };
}

function safeFileSegment(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 50) || "target-role"
  );
}

export async function generateTailoredResume(input: {
  readonly ai: AIProvider;
  readonly correlationId: string;
  readonly evidence: readonly ResumeEvidence[];
  readonly job: ResumeTargetJob;
  readonly renderer: ResumeDocumentRenderer;
  readonly repository: ResumeArtifactRepository;
  readonly storage: ResumeObjectStore;
  readonly userId: string;
}) {
  const definition = aiTaskDefinitions.RESUME_TAILORING;
  const evidence = selectRelevantResumeEvidence(input.evidence, input.job);
  if (evidence.length === 0)
    throw new AIInvalidOutputError("Verified candidate evidence is required.");
  const generated = await input.ai.generateStructured({
    correlationId: input.correlationId,
    rateLimitSubject: input.userId,
    input: {
      targetJob: input.job,
      evidence: evidence.map(
        ({ evidenceType, evidenceId, evidenceField, label, snapshot }) => ({
          evidenceType,
          evidenceId,
          evidenceField,
          label,
          snapshot,
        }),
      ),
    },
    ...definition,
    task: "RESUME_TAILORING",
  });
  const validated = validateOutput(generated.data, evidence);
  const bytes = await input.renderer.render(validated.content);
  const storageKey = `resumes/${input.userId}/${crypto.randomUUID()}.docx`;
  const fileName = `${safeFileSegment(input.job.title)}-${safeFileSegment(input.job.company)}.docx`;
  await input.storage.put(
    storageKey,
    bytes,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  const saved = await input.repository.save({
    ...validated,
    generator: generated.metadata.model,
    promptVersion: definition.promptVersion,
    renderedContentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    renderedFileName: fileName,
    renderedStorageKey: storageKey,
    targetJobId: input.job.id,
    templateVersion: RESUME_TEMPLATE_VERSION,
    userId: input.userId,
  });
  return { ...saved, ...validated, bytes, fileName, storageKey };
}
