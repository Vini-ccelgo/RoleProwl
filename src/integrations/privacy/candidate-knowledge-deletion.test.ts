import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("candidate knowledge deletion migration", () => {
  it("cascades user-owned narratives and proposals and does not orphan memories", async () => {
    const migration = await readFile(
      new URL(
        "../../../prisma/migrations/20260912010000_add_candidate_knowledge/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toContain(
      '"CandidateNarrative_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      '"CandidateKnowledgeProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      '"CandidateKnowledgeProposal_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "CandidateNarrative"("id") ON DELETE CASCADE',
    );
    expect(migration).toContain(
      '"AnswerMemory_sourceNarrativeId_fkey" FOREIGN KEY ("sourceNarrativeId") REFERENCES "CandidateNarrative"("id") ON DELETE SET NULL',
    );
  });
});
