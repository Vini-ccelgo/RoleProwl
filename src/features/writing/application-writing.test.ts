import { describe, expect, it, vi } from "vitest";
import {
  AIInvalidOutputError,
  ValidationError,
} from "@/core/errors/application-errors";
import { DeterministicAIProvider } from "@/integrations/ai/deterministic-ai-provider";
import {
  generateApplicationWriting,
  hasFabricatedEmployerAttachment,
  selectRelevantWritingEvidence,
} from "./application-writing";

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
        targetJobId: "job-1",
        type: "COVER_LETTER",
        userId: "user-1",
      }),
    );
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
});
