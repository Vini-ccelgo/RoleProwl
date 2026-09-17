import { z } from "zod";
import type { AITask } from "@/core/contracts/ai-provider";

const evidenceReference = z.object({
  evidenceType: z.string().max(128),
  evidenceId: z.string().max(128),
  evidenceField: z.string().max(128),
});

const generatedClaim = z.object({
  text: z.string().max(5_000),
  classification: z.enum([
    "DIRECT_FACT",
    "SUPPORTED_REWRITE",
    "SUPPORTED_INFERENCE",
    "UNSUPPORTED",
  ]),
  assertions: z
    .array(
      z.object({
        kind: z.enum([
          "EMPLOYER_NAME",
          "CREDENTIAL_NAME",
          "DURATION_MONTHS",
          "MANAGEMENT_SCOPE",
          "NUMERIC_ACHIEVEMENT",
        ]),
        value: z.string().max(1_000),
      }),
    )
    .max(50),
  sourceEvidence: z.array(evidenceReference).max(50),
});

export const aiTaskDefinitions = {
  RESUME_FACT_EXTRACTION: {
    promptVersion: "resume-facts-v1",
    schemaName: "resume_fact_proposals",
    system:
      "Extract only candidate facts explicitly supported by the supplied resume text. Preserve source text and uncertainty. Do not resolve conflicts or invent missing values.",
    schema: z.object({
      proposals: z
        .array(
          z.object({
            factType: z.string().max(128),
            proposedValue: z.record(z.string(), z.unknown()),
            sourceText: z.string().max(5_000),
            confidence: z.number().min(0).max(1),
          }),
        )
        .max(200),
    }),
  },
  CANDIDATE_NARRATIVE_EXTRACTION: {
    promptVersion: "candidate-narrative-v1",
    schemaName: "candidate_narrative_proposals",
    system:
      "Extract only reusable concepts explicitly supported by the candidate-authored narrative. Select only from allowedConcepts. supportingText must be an exact substring of the narrative. Faithful normalization may be DERIVED; do not infer missing facts, consent, salary, proficiency, preferences, or any authorization/sponsorship jurisdiction. Authorization or sponsorship may be proposed only when the candidate explicitly states the fact and its country. Every result remains a proposal requiring candidate review.",
    schema: z.object({
      proposals: z
        .array(
          z.object({
            concept: z.string().max(128),
            value: z.string().min(1).max(2_500),
            supportingText: z.string().min(1).max(2_500),
            origin: z.enum(["EXPLICIT", "DERIVED"]),
            confidence: z.number().min(0).max(1),
            approvalRequired: z.literal(true),
          }),
        )
        .max(12),
    }),
  },
  JOB_REQUIREMENT_NORMALIZATION: {
    promptVersion: "job-requirements-v1",
    schemaName: "job_requirements",
    system:
      "Normalize only requirements stated by the supplied job. Separate required, preferred, contradictory, and unknown information. Do not infer unstated requirements.",
    schema: z.object({
      required: z
        .array(
          z.object({
            type: z.string().max(128),
            value: z.string().max(1_000),
            sourceText: z.string().max(5_000),
          }),
        )
        .max(200),
      preferred: z
        .array(
          z.object({
            type: z.string().max(128),
            value: z.string().max(1_000),
            sourceText: z.string().max(5_000),
          }),
        )
        .max(200),
      contradictions: z.array(z.string().max(1_000)).max(100),
      unknowns: z.array(z.string().max(1_000)).max(100),
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
      evidenceIds: z.array(z.string().max(128)).max(100),
      explanation: z.string().max(2_500),
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
      rationale: z.string().max(2_000),
    }),
  },
  APPLICATION_QUESTION_RESOLUTION: {
    promptVersion: "application-question-resolution-v2",
    schemaName: "application_question_resolutions",
    system:
      "Map only the supplied ordinary employer questions to allowedConcepts and supplied candidateKnowledge. For CHOICE_TAXONOMY mode, select only exact supplied raw option values and report whether meaningful ambiguity requires candidate confirmation. A proposed value must be a faithful direct value or bounded reformulation supported by every listed candidateKnowledgeReference. Never invent facts, upgrade qualifications, completion, proficiency, or experience, infer negative personal facts, compensation, work authorization, sponsorship, consent, or employer relationships, or answer employer-specific motivation. Return no resolution when the supplied knowledge is insufficient.",
    schema: z.object({
      resolutions: z
        .array(
          z.object({
            questionId: z.string().max(500),
            canonicalConcept: z.string().max(128).nullable(),
            proposedValue: z.string().max(4_000).nullable(),
            selectedOptionValues: z
              .array(z.string().max(500))
              .max(8)
              .optional(),
            requiresCandidateConfirmation: z.boolean().optional(),
            candidateKnowledgeReferences: z.array(z.string().max(512)).max(8),
            confidence: z.number().min(0).max(1),
          }),
        )
        .max(50),
    }),
  },
  FREE_TEXT_APPLICATION_GENERATION: {
    promptVersion: "application-free-text-v1",
    schemaName: "application_free_text",
    system:
      "Write a concise answer using only the supplied job, preferences, and evidence. Do not invent employer attachment or candidate facts. Attach evidence to every candidate-specific claim.",
    schema: z.object({
      text: z.string().max(2500),
      claims: z.array(generatedClaim).max(100),
    }),
  },
  RESUME_TAILORING: {
    promptVersion: "resume-tailoring-v1",
    schemaName: "tailored_resume",
    system:
      "Select and safely rewrite only supplied candidate evidence for the target job. Preserve employers, dates, credentials, skills, durations, and numbers exactly unless the supplied evidence supports the change.",
    schema: z.object({
      headline: z.string().max(300),
      summary: z.string().max(2_500),
      sections: z
        .array(
          z.object({
            heading: z.string().max(200),
            bullets: z.array(z.string().max(1_500)).max(50),
          }),
        )
        .max(20),
      claims: z.array(generatedClaim).max(200),
    }),
  },
  COVER_LETTER_GENERATION: {
    promptVersion: "cover-letter-v2",
    schemaName: "cover_letter",
    system:
      "Write a concise role-specific cover letter using only the supplied candidate evidence, job context, and preferences. Do not invent candidate facts, employers, credentials, dates, durations, management scope, numeric achievements, or personal attachment to the employer. Every candidate-specific factual statement must be supported by supplied evidence. For every claim, copy claim.text verbatim from the body so it is an exact substring, and copy evidenceType, evidenceId, and evidenceField exactly from at least one supplied sourceEvidence identity without altering them. Omit unsupported statements from both the body and claims; never emit UNSUPPORTED. Use DIRECT_FACT only for direct support, SUPPORTED_REWRITE only for faithful reformulation, and SUPPORTED_INFERENCE only with at least two supplied evidence references. Add assertions only when their values are supported by the linked evidence: employer and credential names must correspond to evidence values, durations must be exactly supported by linked dates, management scope requires management or leadership evidence, and numeric achievements require the exact supported number. Use an empty assertions array when none is necessary, and do not create claims for generic prose unless required.",
    schema: z.object({
      subject: z.string().max(300).nullable(),
      body: z.string().max(5000),
      claims: z.array(generatedClaim).max(100),
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
