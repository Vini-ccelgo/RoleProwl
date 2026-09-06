import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() =>
  vi.fn(async () => ({ id: "writing-artifact-1" })),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    applicationWritingArtifact: { create },
  })),
}));

import { PrismaApplicationWritingRepository } from "./prisma-application-writing-repository";

const input = {
  claims: [
    {
      assertions: [{ kind: "EMPLOYER_NAME" as const, value: "Acme" }],
      classification: "DIRECT_FACT" as const,
      evidence: [
        {
          evidenceField: "value",
          evidenceId: "fact-acme",
          evidenceType: "CANDIDATE_FACT",
          snapshot: { text: "Worked at Acme" },
        },
      ],
      text: "I worked at Acme.",
    },
  ],
  content: "I worked at Acme.",
  generator: "gemini-test-model",
  promptVersion: "cover-letter-v1",
  question: null,
  targetJobId: "job-1",
  type: "COVER_LETTER" as const,
  userId: "user-1",
};

describe("Prisma application writing repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates one owner-scoped artifact with provenance-linked claims", async () => {
    const result = await new PrismaApplicationWritingRepository().save(input);

    expect(result).toEqual({ id: "writing-artifact-1" });
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      data: {
        claims: {
          create: [
            {
              claim: {
                create: {
                  assertions: [{ kind: "EMPLOYER_NAME", value: "Acme" }],
                  classification: "DIRECT_FACT",
                  generator: "gemini-test-model",
                  promptVersion: "cover-letter-v1",
                  sourceEvidence: {
                    create: [
                      {
                        evidenceField: "value",
                        evidenceId: "fact-acme",
                        evidenceSnapshot: { text: "Worked at Acme" },
                        evidenceType: "CANDIDATE_FACT",
                        userId: "user-1",
                      },
                    ],
                  },
                  text: "I worked at Acme.",
                  userId: "user-1",
                  verifiedAt: expect.any(Date),
                },
              },
            },
          ],
        },
        content: "I worked at Acme.",
        generator: "gemini-test-model",
        promptVersion: "cover-letter-v1",
        question: null,
        targetJobId: "job-1",
        type: "COVER_LETTER",
        userId: "user-1",
      },
      select: { id: true },
    });
  });

  it("creates a new artifact on explicit regeneration without updating application state", async () => {
    const repository = new PrismaApplicationWritingRepository();

    await repository.save(input);
    await repository.save({ ...input, content: "A second reviewed draft." });

    expect(create).toHaveBeenCalledTimes(2);
    const calls = create.mock.calls as unknown as Array<
      [{ data: { content: string } }]
    >;
    expect(calls[0]![0].data.content).toBe("I worked at Acme.");
    expect(calls[1]![0].data.content).toBe("A second reviewed draft.");
  });
});
