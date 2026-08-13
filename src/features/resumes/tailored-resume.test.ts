import { describe, expect, it, vi } from "vitest";
import { AIInvalidOutputError } from "@/core/errors/application-errors";
import { DeterministicAIProvider } from "@/integrations/ai/deterministic-ai-provider";
import {
  generateTailoredResume,
  selectRelevantResumeEvidence,
} from "./tailored-resume";

const evidence = [
  {
    evidenceType: "work_experience",
    evidenceId: "work-1",
    evidenceField: "employer",
    label: "Verified work experience",
    searchableText: "Acme Senior Engineer TypeScript platform",
    snapshot: {
      employer: "Acme",
      title: "Senior Engineer",
      skills: ["TypeScript"],
    },
  },
  {
    evidenceType: "skill",
    evidenceId: "skill-1",
    evidenceField: "canonicalName",
    label: "Verified skill",
    searchableText: "TypeScript",
    snapshot: { canonicalName: "TypeScript" },
  },
] as const;

const job = {
  id: "job-1",
  company: "Target Co",
  title: "TypeScript Engineer",
  description: "Build a TypeScript platform",
  requirements: ["TypeScript"],
};

function generated(employer = "Acme") {
  const reference = {
    evidenceType: "work_experience",
    evidenceId: "work-1",
    evidenceField: "employer",
  };
  return {
    headline: "Senior Engineer",
    summary: "Engineer with verified platform experience.",
    sections: [
      { heading: "Experience", bullets: [`Senior Engineer at ${employer}`] },
    ],
    claims: [
      {
        text: "Senior Engineer",
        classification: "DIRECT_FACT",
        assertions: [],
        sourceEvidence: [reference],
      },
      {
        text: "Engineer with verified platform experience.",
        classification: "SUPPORTED_REWRITE",
        assertions: [],
        sourceEvidence: [reference],
      },
      {
        text: `Senior Engineer at ${employer}`,
        classification: "DIRECT_FACT",
        assertions: [{ kind: "EMPLOYER_NAME", value: employer }],
        sourceEvidence: [reference],
      },
    ],
  };
}

describe("tailored resume engine", () => {
  it("prioritizes evidence that overlaps the target job", () => {
    const selected = selectRelevantResumeEvidence(
      [
        ...evidence,
        {
          ...evidence[0],
          evidenceId: "unrelated",
          searchableText: "Watercolor",
        },
      ],
      job,
    );
    expect(selected[0]?.evidenceId).toBe("work-1");
    expect(selected.at(-1)?.evidenceId).toBe("unrelated");
  });

  it("validates, renders, stores, and persists a grounded resume", async () => {
    const save = vi.fn().mockResolvedValue({ id: "resume-1" });
    const put = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn().mockResolvedValue(new Uint8Array([80, 75, 3, 4]));
    const result = await generateTailoredResume({
      ai: new DeterministicAIProvider(() => generated()),
      correlationId: "corr-1",
      evidence,
      job,
      renderer: { render },
      repository: { save },
      storage: { put },
      userId: "user-1",
    });

    expect(result.id).toBe("resume-1");
    expect(result.claims).toHaveLength(3);
    expect(render).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^resumes\/user-1\/[\da-f-]+\.docx$/u),
      expect.any(Uint8Array),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        targetJobId: "job-1",
        templateVersion: "roleprowl-classic-v1",
      }),
    );
  });

  it("blocks an invented employer before rendering or persistence", async () => {
    const render = vi.fn();
    const save = vi.fn();
    await expect(
      generateTailoredResume({
        ai: new DeterministicAIProvider(() => generated("Invented Corp")),
        correlationId: "corr-2",
        evidence,
        job,
        renderer: { render },
        repository: { save },
        storage: { put: vi.fn() },
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(AIInvalidOutputError);
    expect(render).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("blocks a material statement that has no matching claim", async () => {
    const output = generated();
    output.claims.splice(1, 1);
    await expect(
      generateTailoredResume({
        ai: new DeterministicAIProvider(() => output),
        correlationId: "corr-3",
        evidence,
        job,
        renderer: { render: vi.fn() },
        repository: { save: vi.fn() },
        storage: { put: vi.fn() },
        userId: "user-1",
      }),
    ).rejects.toThrow("Every material resume statement");
  });
});
