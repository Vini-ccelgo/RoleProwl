import { beforeEach, describe, expect, it, vi } from "vitest";
import { databaseClient } from "@/lib/db/client";
import { getCandidateTruthVault } from "./prisma-truth-vault";

vi.mock("@/lib/db/client", () => ({ databaseClient: vi.fn() }));

describe("Prisma Truth Vault projection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads owner-scoped verified résumé facts with their provenance", async () => {
    const verifiedResumeFacts = [
      {
        id: "fact-1",
        factType: "SKILL_TEXT",
        value: { text: "TypeScript" },
        sourceProposal: {
          id: "proposal-1",
          status: "ACCEPTED",
          targetPath: "candidateFacts.skills",
          sourceRegion: { text: "TypeScript" },
          document: { id: "document-1", originalFileName: "synthetic.pdf" },
        },
      },
    ];
    const findManyFact = vi.fn(async () => verifiedResumeFacts);
    const emptyMany = vi.fn(async () => []);
    const emptyOne = vi.fn(async () => null);
    vi.mocked(databaseClient).mockReturnValue({
      candidateProfile: { findUnique: emptyOne },
      workExperience: { findMany: emptyMany },
      education: { findMany: emptyMany },
      skill: { findMany: emptyMany },
      project: { findMany: emptyMany },
      credential: { findMany: emptyMany },
      candidateFact: { findMany: findManyFact },
      candidatePreferences: { findUnique: emptyOne },
      workAuthorizationProfile: { findUnique: emptyOne },
    } as never);

    const vault = await getCandidateTruthVault("user-1");

    expect(findManyFact).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        include: expect.objectContaining({
          sourceProposal: expect.any(Object),
        }),
      }),
    );
    expect(vault.verifiedResumeFacts).toEqual(verifiedResumeFacts);
  });
});
