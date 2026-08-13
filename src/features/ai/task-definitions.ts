import { z } from "zod";
import type { AITask } from "@/core/contracts/ai-provider";

const evidenceReference = z.object({
  evidenceType: z.string(),
  evidenceId: z.string(),
  evidenceField: z.string(),
});

const generatedClaim = z.object({
  text: z.string(),
  classification: z.enum([
    "DIRECT_FACT",
    "SUPPORTED_REWRITE",
    "SUPPORTED_INFERENCE",
    "UNSUPPORTED",
  ]),
  assertions: z.array(
    z.object({
      kind: z.enum([
        "EMPLOYER_NAME",
        "CREDENTIAL_NAME",
        "DURATION_MONTHS",
        "MANAGEMENT_SCOPE",
        "NUMERIC_ACHIEVEMENT",
      ]),
      value: z.string(),
    }),
  ),
  sourceEvidence: z.array(evidenceReference),
});

export const aiTaskDefinitions = {
  RESUME_FACT_EXTRACTION: {
    promptVersion: "resume-facts-v1",
    schemaName: "resume_fact_proposals",
    system:
      "Extract only candidate facts explicitly supported by the supplied resume text. Preserve source text and uncertainty. Do not resolve conflicts or invent missing values.",
    schema: z.object({
      proposals: z.array(
        z.object({
          factType: z.string(),
          proposedValue: z.record(z.string(), z.unknown()),
          sourceText: z.string(),
          confidence: z.number().min(0).max(1),
        }),
      ),
    }),
  },
  JOB_REQUIREMENT_NORMALIZATION: {
    promptVersion: "job-requirements-v1",
    schemaName: "job_requirements",
    system:
      "Normalize only requirements stated by the supplied job. Separate required, preferred, contradictory, and unknown information. Do not infer unstated requirements.",
    schema: z.object({
      required: z.array(
        z.object({
          type: z.string(),
          value: z.string(),
          sourceText: z.string(),
        }),
      ),
      preferred: z.array(
        z.object({
          type: z.string(),
          value: z.string(),
          sourceText: z.string(),
        }),
      ),
      contradictions: z.array(z.string()),
      unknowns: z.array(z.string()),
    }),
  },
  SEMANTIC_EVIDENCE_COMPARISON: {
    promptVersion: "semantic-evidence-v1",
    schemaName: "semantic_evidence_comparison",
    system:
      "Compare the claim with the supplied evidence. Return support only from those evidence records. Lexical similarity alone is insufficient.",
    schema: z.object({
      supported: z.boolean(),
      classification: z.enum([
        "DIRECT_FACT",
        "SUPPORTED_REWRITE",
        "SUPPORTED_INFERENCE",
        "UNSUPPORTED",
      ]),
      evidenceIds: z.array(z.string()),
      explanation: z.string(),
    }),
  },
  APPLICATION_QUESTION_CLASSIFICATION: {
    promptVersion: "application-question-v1",
    schemaName: "application_question_classification",
    system:
      "Classify the supplied application question. Do not answer it. High-risk deterministic classification will override this result.",
    schema: z.object({
      classification: z.enum([
        "PROFILE_FACT",
        "COMPUTABLE_FACT",
        "USER_POLICY",
        "JOB_SPECIFIC_FREE_TEXT",
        "SENSITIVE_PERSONAL_DATA",
        "LEGAL_OR_CONSEQUENTIAL",
        "ATTESTATION",
        "UNKNOWN",
      ]),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
    }),
  },
  FREE_TEXT_APPLICATION_GENERATION: {
    promptVersion: "application-free-text-v1",
    schemaName: "application_free_text",
    system:
      "Write a concise answer using only the supplied job, preferences, and evidence. Do not invent employer attachment or candidate facts. Attach evidence to every candidate-specific claim.",
    schema: z.object({ text: z.string(), claims: z.array(generatedClaim) }),
  },
  RESUME_TAILORING: {
    promptVersion: "resume-tailoring-v1",
    schemaName: "tailored_resume",
    system:
      "Select and safely rewrite only supplied candidate evidence for the target job. Preserve employers, dates, credentials, skills, durations, and numbers exactly unless the supplied evidence supports the change.",
    schema: z.object({
      headline: z.string(),
      summary: z.string(),
      sections: z.array(
        z.object({ heading: z.string(), bullets: z.array(z.string()) }),
      ),
      claims: z.array(generatedClaim),
    }),
  },
  COVER_LETTER_GENERATION: {
    promptVersion: "cover-letter-v1",
    schemaName: "cover_letter",
    system:
      "Write a concise role-specific cover letter from supplied evidence and preferences. Do not fabricate personal attachment to the employer. Attach evidence to candidate-specific claims.",
    schema: z.object({
      subject: z.string().nullable(),
      body: z.string(),
      claims: z.array(generatedClaim),
    }),
  },
} as const satisfies Record<
  AITask,
  {
    readonly promptVersion: string;
    readonly schemaName: string;
    readonly system: string;
    readonly schema: z.ZodType;
  }
>;
