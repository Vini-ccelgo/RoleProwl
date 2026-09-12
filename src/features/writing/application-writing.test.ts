import type { GenerateContentResponse } from "@google/genai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AIInvalidOutputError,
  ValidationError,
} from "@/core/errors/application-errors";
import { DeterministicAIProvider } from "@/integrations/ai/deterministic-ai-provider";
import {
  GeminiAIProvider,
  type GeminiGenerateClient,
} from "@/integrations/ai/gemini-provider";
import {
  APPLICATION_WRITING_REJECTION_REASONS,
  generateApplicationWriting,
  hasFabricatedEmployerAttachment,
  selectRelevantWritingEvidence,
} from "./application-writing";
import { logger } from "@/lib/logging/logger";

const evidence = [
  {
    evidenceType: "work_experience",
    evidenceId: "work-1",
    evidenceField: "employer",
    label: "Verified work experience",
    snapshot: { employer: "Acme", title: "Engineer" },
  },
] as const;
const reference = {
  evidenceType: "work_experience",
  evidenceId: "work-1",
  evidenceField: "employer",
};
const candidateEvidence = [
  {
    evidenceType: "CANDIDATE_FACT",
    evidenceId: "fact-123",
    evidenceField: "value",
    label: "Verified candidate skill",
    snapshot: { text: "PRIVATE_CANDIDATE_FACT_DO_NOT_LOG Python" },
  },
  {
    evidenceType: "CANDIDATE_FACT",
    evidenceId: "fact-456",
    evidenceField: "value",
    label: "Verified candidate project",
    snapshot: { text: "Python security analysis automation" },
  },
] as const;
const candidateReference = {
  evidenceType: "CANDIDATE_FACT",
  evidenceId: "fact-123",
  evidenceField: "value",
};

type WritingInput = Parameters<typeof generateApplicationWriting>[0];

function base(
  overrides: Pick<WritingInput, "ai" | "type"> & Partial<WritingInput>,
): WritingInput {
  return {
    correlationId: "corr-write",
    company: "Target Co",
    evidence,
    jobContext: { title: "Platform Engineer", company: "Target Co" },
    preferences: { roleFamilies: ["Platform Engineering"] },
    repository: { save: vi.fn().mockResolvedValue({ id: "writing-1" }) },
    targetJobId: "job-1",
    userId: "user-1",
    ...overrides,
  };
}

function claim(text: string, employer = "Acme") {
  return {
    text,
    classification: "DIRECT_FACT" as const,
    assertions: [{ kind: "EMPLOYER_NAME" as const, value: employer }],
    sourceEvidence: [reference],
  };
}

describe("application writing engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(logger, "log").mockImplementation(() => undefined);
  });

  it("selects only deterministically job-relevant evidence", () => {
    expect(
      selectRelevantWritingEvidence(
        [
          ...evidence,
          {
            evidenceType: "candidate_fact",
            evidenceId: "fact-python",
            evidenceField: "value",
            label: "Verified candidate skill",
            snapshot: { text: "Languages: Python, SQL" },
          },
          {
            evidenceType: "candidate_fact",
            evidenceId: "fact-generic-overlap",
            evidenceField: "value",
            label: "Verified candidate experience",
            snapshot: { text: "Worked with a bakery team" },
          },
        ],
        {
          company: "Target Co",
          title: "Python Developer",
          requirements: ["Python", "Work with the platform team"],
        },
      ).map(({ evidenceId }) => evidenceId),
    ).toEqual(["fact-python"]);
  });

  it("generates concise free text and persists provenance", async () => {
    const text = "My engineering work at Acme aligns with this platform role.";
    const input = base({
      type: "MOTIVATION_RESPONSE",
      ai: new DeterministicAIProvider(() => ({ text, claims: [claim(text)] })),
    });
    const result = await generateApplicationWriting(input);
    expect(result).toMatchObject({ id: "writing-1", content: text });
    expect(input.repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "MOTIVATION_RESPONSE",
        claims: expect.any(Array),
      }),
    );
  });

  it("uses the distinct cover-letter task and stores its body", async () => {
    const body = "At Acme, I worked as an Engineer.";
    const input = base({
      type: "COVER_LETTER",
      ai: new DeterministicAIProvider((request) => {
        expect(request.task).toBe("COVER_LETTER_GENERATION");
        expect(request.dataClassification).toBe("REAL_CANDIDATE");
        return { subject: null, body, claims: [claim(body)] };
      }),
    });
    const result = await generateApplicationWriting(input);
    expect(result.content).toBe(body);
    expect(input.repository.save).toHaveBeenCalledOnce();
    expect(input.repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        generator: "deterministic-test-provider",
        promptVersion: "cover-letter-v2",
        targetJobId: "job-1",
        type: "COVER_LETTER",
        userId: "user-1",
      }),
    );
  });

  it("accepts an exact claim substring with exact supplied evidence identity", async () => {
    const body = "I used Python to automate security analysis.";
    const input = base({
      type: "COVER_LETTER",
      evidence: candidateEvidence,
      ai: new DeterministicAIProvider(() => ({
        subject: null,
        body,
        claims: [
          {
            text: body,
            classification: "DIRECT_FACT",
            assertions: [],
            sourceEvidence: [candidateReference],
          },
        ],
      })),
    });

    await expect(generateApplicationWriting(input)).resolves.toMatchObject({
      content: body,
      id: "writing-1",
    });
    expect(input.repository.save).toHaveBeenCalledOnce();
  });

  it("rejects a paraphrased claim that is not a literal body substring", async () => {
    const body = "I used Python to automate security analysis.";
    const input = base({
      type: "COVER_LETTER",
      evidence: candidateEvidence,
      ai: new DeterministicAIProvider(() => ({
        subject: null,
        body,
        claims: [
          {
            text: "I automated security analysis using Python.",
            classification: "DIRECT_FACT",
            assertions: [],
            sourceEvidence: [candidateReference],
          },
        ],
      })),
    });

    await expect(generateApplicationWriting(input)).rejects.toBeInstanceOf(
      AIInvalidOutputError,
    );
    expect(input.repository.save).not.toHaveBeenCalled();
  });

  it.each([
    ["evidenceType", { ...candidateReference, evidenceType: "OTHER_FACT" }],
    ["evidenceId", { ...candidateReference, evidenceId: "fact-999" }],
    ["evidenceField", { ...candidateReference, evidenceField: "label" }],
  ])(
    "rejects a changed %s without evidence fallback",
    async (_field, changed) => {
      const body = "I used Python to automate security analysis.";
      const input = base({
        type: "COVER_LETTER",
        evidence: candidateEvidence,
        ai: new DeterministicAIProvider(() => ({
          subject: null,
          body,
          claims: [
            {
              text: body,
              classification: "DIRECT_FACT",
              assertions: [],
              sourceEvidence: [changed],
            },
          ],
        })),
      });

      await expect(generateApplicationWriting(input)).rejects.toThrow(
        "unknown evidence",
      );
      expect(input.repository.save).not.toHaveBeenCalled();
    },
  );

  it("requires two exact evidence references for supported inference", async () => {
    const body = "My Python experience supports security automation work.";
    const generated = (sourceEvidence: (typeof candidateReference)[]) => ({
      subject: null,
      body,
      claims: [
        {
          text: body,
          classification: "SUPPORTED_INFERENCE" as const,
          assertions: [],
          sourceEvidence,
        },
      ],
    });
    const one = base({
      type: "COVER_LETTER",
      evidence: candidateEvidence,
      ai: new DeterministicAIProvider(() => generated([candidateReference])),
    });
    const two = base({
      type: "COVER_LETTER",
      evidence: candidateEvidence,
      ai: new DeterministicAIProvider(() =>
        generated([
          candidateReference,
          { ...candidateReference, evidenceId: "fact-456" },
        ]),
      ),
    });

    await expect(generateApplicationWriting(one)).rejects.toBeInstanceOf(
      AIInvalidOutputError,
    );
    expect(one.repository.save).not.toHaveBeenCalled();
    await expect(generateApplicationWriting(two)).resolves.toMatchObject({
      id: "writing-1",
    });
    expect(two.repository.save).toHaveBeenCalledOnce();
  });

  it("rejects unsupported cover-letter claims before persistence", async () => {
    const body = "I transformed every system at Acme.";
    const input = base({
      type: "COVER_LETTER",
      ai: new DeterministicAIProvider(() => ({
        subject: null,
        body,
        claims: [
          {
            ...claim(body),
            classification: "UNSUPPORTED",
          },
        ],
      })),
    });

    await expect(generateApplicationWriting(input)).rejects.toThrow(
      "Unsupported claims",
    );
    expect(input.repository.save).not.toHaveBeenCalled();
  });

  it("rejects unknown cover-letter evidence before persistence", async () => {
    const body = "At Acme, I worked as an Engineer.";
    const input = base({
      type: "COVER_LETTER",
      ai: new DeterministicAIProvider(() => ({
        subject: null,
        body,
        claims: [
          {
            ...claim(body),
            sourceEvidence: [{ ...reference, evidenceId: "unknown-evidence" }],
          },
        ],
      })),
    });

    await expect(generateApplicationWriting(input)).rejects.toThrow(
      "unknown evidence",
    );
    expect(input.repository.save).not.toHaveBeenCalled();
  });

  it("rejects an oversized Gemini result before writing persistence", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        subject: null,
        body: "x".repeat(5_001),
        claims: [],
      }),
    } as unknown as GenerateContentResponse);
    const repository = {
      save: vi.fn().mockResolvedValue({ id: "must-not-save" }),
    };
    const input = base({
      type: "COVER_LETTER",
      ai: new GeminiAIProvider(
        { generateContent } as GeminiGenerateClient,
        {
          liteModel: "gemini-3.5-flash-lite",
          flashModel: "gemini-3.5-flash",
          liteRpmLimit: 12,
          liteRpdLimit: 450,
          flashRpmLimit: 4,
          flashRpdLimit: 15,
          maxRetries: 0,
          timeoutMs: 1_000,
        },
        { log: vi.fn() },
      ),
      repository,
    });

    await expect(generateApplicationWriting(input)).rejects.toBeInstanceOf(
      AIInvalidOutputError,
    );
    expect(generateContent).toHaveBeenCalledOnce();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("requires an employer question for employer free text", async () => {
    await expect(
      generateApplicationWriting(
        base({
          type: "EMPLOYER_FREE_TEXT",
          ai: new DeterministicAIProvider(() => ({ text: "", claims: [] })),
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects invented facts and claims absent from content", async () => {
    const text = "I worked at Acme.";
    await expect(
      generateApplicationWriting(
        base({
          type: "ROLE_SUMMARY",
          ai: new DeterministicAIProvider(() => ({
            text,
            claims: [claim("I worked at Invented Corp.", "Invented Corp")],
          })),
        }),
      ),
    ).rejects.toBeInstanceOf(AIInvalidOutputError);
  });

  it("blocks fabricated personal attachment to the target employer", async () => {
    const text = "I have always dreamed of working at Target Co.";
    expect(hasFabricatedEmployerAttachment(text, "Target Co")).toBe(true);
    await expect(
      generateApplicationWriting(
        base({
          type: "MOTIVATION_RESPONSE",
          ai: new DeterministicAIProvider(() => ({
            text,
            claims: [claim(text)],
          })),
        }),
      ),
    ).rejects.toThrow("Fabricated personal attachment");
  });

  it.each([
    {
      reason: "FABRICATED_EMPLOYER_ATTACHMENT",
      body: "GENERATED_BODY_DO_NOT_LOG I have always dreamed of working at Target Co.",
      claims: [],
    },
    {
      reason: "CLAIM_NOT_IN_CONTENT",
      body: "GENERATED_BODY_DO_NOT_LOG",
      claims: [
        {
          text: "PRIVATE_CANDIDATE_FACT_DO_NOT_LOG",
          classification: "DIRECT_FACT",
          assertions: [],
          sourceEvidence: [candidateReference],
        },
      ],
    },
    {
      reason: "MODEL_MARKED_UNSUPPORTED",
      body: "GENERATED_BODY_DO_NOT_LOG",
      claims: [
        {
          text: "GENERATED_BODY_DO_NOT_LOG",
          classification: "UNSUPPORTED",
          assertions: [],
          sourceEvidence: [candidateReference],
        },
      ],
    },
    {
      reason: "UNKNOWN_EVIDENCE",
      body: "GENERATED_BODY_DO_NOT_LOG",
      claims: [
        {
          text: "GENERATED_BODY_DO_NOT_LOG",
          classification: "DIRECT_FACT",
          assertions: [],
          sourceEvidence: [
            {
              ...candidateReference,
              evidenceId: "SECRET_EVIDENCE_ID_DO_NOT_LOG",
            },
          ],
        },
      ],
    },
    {
      reason: "CLAIM_HAS_NO_LINKED_EVIDENCE",
      body: "GENERATED_BODY_DO_NOT_LOG",
      claims: [
        {
          text: "GENERATED_BODY_DO_NOT_LOG",
          classification: "DIRECT_FACT",
          assertions: [],
          sourceEvidence: [],
        },
      ],
    },
    {
      reason: "ASSERTION_NOT_SUPPORTED",
      body: "GENERATED_BODY_DO_NOT_LOG",
      claims: [
        {
          text: "GENERATED_BODY_DO_NOT_LOG",
          classification: "DIRECT_FACT",
          assertions: [
            {
              kind: "CREDENTIAL_NAME",
              value: "PRIVATE_ASSERTION_VALUE_DO_NOT_LOG",
            },
          ],
          sourceEvidence: [candidateReference],
        },
      ],
    },
    {
      reason: "INFERENCE_INSUFFICIENT_EVIDENCE",
      body: "GENERATED_BODY_DO_NOT_LOG",
      claims: [
        {
          text: "GENERATED_BODY_DO_NOT_LOG",
          classification: "SUPPORTED_INFERENCE",
          assertions: [],
          sourceEvidence: [candidateReference],
        },
      ],
    },
  ] as const)(
    "logs only bounded metadata for $reason and does not persist",
    async ({ reason, body, claims }) => {
      const input = base({
        type: "COVER_LETTER",
        evidence: candidateEvidence,
        ai: new DeterministicAIProvider(() => ({
          subject: "PRIVATE_SUBJECT_DO_NOT_LOG",
          body,
          claims: [...claims],
        })),
      });

      await expect(generateApplicationWriting(input)).rejects.toBeInstanceOf(
        AIInvalidOutputError,
      );
      expect(input.repository.save).not.toHaveBeenCalled();
      expect(APPLICATION_WRITING_REJECTION_REASONS).toContain(reason);
      expect(logger.log).toHaveBeenCalledOnce();
      expect(logger.log).toHaveBeenCalledWith(
        "warn",
        "application_writing_rejected",
        {
          correlationId: "corr-write",
          writingType: "COVER_LETTER",
          rejectionReason: reason,
          task: "COVER_LETTER_GENERATION",
        },
      );
      const serializedLog = JSON.stringify(vi.mocked(logger.log).mock.calls);
      for (const sentinel of [
        "PRIVATE_CANDIDATE_FACT_DO_NOT_LOG",
        "SECRET_EVIDENCE_ID_DO_NOT_LOG",
        "GENERATED_BODY_DO_NOT_LOG",
        "PRIVATE_ASSERTION_VALUE_DO_NOT_LOG",
        "PRIVATE_SUBJECT_DO_NOT_LOG",
      ]) {
        expect(serializedLog).not.toContain(sentinel);
      }
    },
  );
});
