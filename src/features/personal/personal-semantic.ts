import { z } from "zod";
import type {
  AIProvider,
  StructuredAIRequest,
} from "@/core/contracts/ai-provider";
import type { PersonalJobResult, PersonalProwlResult } from "./personal-prowl";

const groundedEvidenceSchema = z.object({
  label: z.string().trim().min(1).max(140),
  explanation: z.string().trim().min(1).max(500),
  resumeEvidenceQuote: z.string().trim().min(1).max(500),
});

const semanticResultSchema = z.object({
  scoreAdjustment: z.number().int().min(-10).max(10),
  summary: z.string().trim().min(1).max(700),
  strongMatches: z.array(groundedEvidenceSchema).max(6),
  partialMatches: z.array(groundedEvidenceSchema).max(6),
  gaps: z.array(z.string().trim().min(1).max(300)).max(6),
  unknowns: z.array(z.string().trim().min(1).max(300)).max(6),
});

type SemanticResult = z.infer<typeof semanticResultSchema>;

function comparable(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function acceptGroundedSemanticResult(
  resume: string,
  output: SemanticResult,
) {
  const candidate = comparable(resume);
  const supported = (item: z.infer<typeof groundedEvidenceSchema>) =>
    candidate.includes(comparable(item.resumeEvidenceQuote));
  return {
    ...output,
    strongMatches: output.strongMatches.filter(supported),
    partialMatches: output.partialMatches.filter(supported),
  };
}

async function enhanceJob(input: {
  readonly ai: AIProvider;
  readonly job: PersonalJobResult;
  readonly resume: string;
}) {
  const request: StructuredAIRequest<SemanticResult> = {
    allowFlashEscalation: false,
    correlationId: `personal-${input.job.id}`,
    input: {
      resume: input.resume,
      job: {
        title: input.job.title,
        company: input.job.company,
        description: input.job.description?.slice(0, 8_000) ?? null,
        deterministicEvidence: {
          strengths: input.job.strongMatches,
          partialMatches: input.job.partialMatches,
          gaps: input.job.importantGaps,
          unknowns: input.job.unknowns,
        },
      },
    },
    modelPreference: "LITE",
    promptVersion: "personal-semantic-v1",
    schema: semanticResultSchema,
    schemaName: "personal_semantic_match",
    system:
      "Compare the job with the resume. Improve terminology and transferable-experience interpretation. Never invent experience. Every positive match must include a short exact quote copied from the resume. Missing information is unknown, not negative evidence. Return only the requested JSON schema.",
    task: "SEMANTIC_EVIDENCE_COMPARISON",
    rateLimitSubject: "local-personal-mode",
  };
  const generated = await input.ai.generateStructured(request);
  const accepted = acceptGroundedSemanticResult(input.resume, generated.data);
  const toEvidence = (
    kind: "SEMANTIC_STRENGTH" | "SEMANTIC_PARTIAL",
    item: z.infer<typeof groundedEvidenceSchema>,
  ) => ({
    code: kind,
    label: item.label,
    evidence: `${item.explanation} Résumé evidence: “${item.resumeEvidenceQuote}”`,
  });
  return {
    ...input.job,
    fitScore: Math.max(
      0,
      Math.min(100, input.job.fitScore + accepted.scoreAdjustment),
    ),
    semanticSummary: accepted.summary,
    strongMatches: [
      ...input.job.strongMatches,
      ...accepted.strongMatches.map((item) =>
        toEvidence("SEMANTIC_STRENGTH", item),
      ),
    ],
    partialMatches: [
      ...input.job.partialMatches,
      ...accepted.partialMatches.map((item) =>
        toEvidence("SEMANTIC_PARTIAL", item),
      ),
    ],
    importantGaps: [
      ...input.job.importantGaps,
      ...accepted.gaps.map((gap) => ({
        code: "SEMANTIC_GAP",
        label: "Semantic gap",
        evidence: gap,
      })),
    ],
    unknowns: [
      ...input.job.unknowns,
      ...accepted.unknowns.map((unknown) => ({
        code: "SEMANTIC_UNKNOWN",
        label: "Semantic unknown",
        evidence: unknown,
      })),
    ],
  } satisfies PersonalJobResult;
}

export async function enhancePersonalResults(input: {
  readonly ai: AIProvider;
  readonly result: PersonalProwlResult;
  readonly resume: string;
  readonly limit: number;
}) {
  const warnings: string[] = [];
  const jobs: PersonalJobResult[] = [];
  let enhancedJobs = 0;
  for (const [index, job] of input.result.jobs.entries()) {
    if (index >= input.limit) {
      jobs.push(job);
      continue;
    }
    try {
      jobs.push(await enhanceJob({ ai: input.ai, job, resume: input.resume }));
      enhancedJobs += 1;
    } catch (error) {
      warnings.push(
        `${job.id}: ${error instanceof Error ? error.message : "local semantic analysis failed"}`,
      );
      jobs.push(job);
    }
  }
  jobs.sort(
    (left, right) =>
      right.fitScore - left.fitScore ||
      right.confidence - left.confidence ||
      left.title.localeCompare(right.title),
  );
  return {
    result: {
      ...input.result,
      mode:
        enhancedJobs > 0 ? ("LOCAL_AI_ENHANCED" as const) : input.result.mode,
      jobs: jobs.map((job, index) => ({ ...job, rank: index + 1 })),
    },
    warnings,
  };
}
