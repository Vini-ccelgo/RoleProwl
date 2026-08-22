import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  PrismaResumeIngestionRepository,
  RESUME_PERSISTENCE_TRANSACTION_TIMEOUT_MS,
  removeFailedResumeRecord,
  type ResumePersistenceSubstage,
} from "./prisma-resume-ingestion";

function databaseFixture(options?: { failDocumentUpdate?: boolean }) {
  const operations: string[] = [];
  const documentUpdate = vi.fn(async () => {
    operations.push("document_status_update");
    if (options?.failDocumentUpdate) {
      throw Object.assign(new Error("expired transaction"), { code: "P2028" });
    }
  });
  const extractionUpdate = vi.fn(async () => {
    operations.push("extraction_status_update");
  });
  const proposalCreateMany = vi.fn(async () => {
    operations.push("fact_proposal_persistence");
  });
  let transactionOptions: unknown;
  const database = {
    $transaction: vi.fn(
      async (
        callback: (transaction: unknown) => Promise<void>,
        options: unknown,
      ) => {
        transactionOptions = options;
        return callback({
          candidateDocument: { update: documentUpdate },
          documentExtraction: { update: extractionUpdate },
          candidateFactProposal: { createMany: proposalCreateMany },
        });
      },
    ),
  } as unknown as PrismaClient;
  return {
    database,
    documentUpdate,
    extractionUpdate,
    operations,
    proposalCreateMany,
    transactionOptions: () => transactionOptions,
  };
}

describe.each(["PDF", "DOCX"] as const)(
  "%s extracted résumé persistence",
  (format) => {
    it("atomically updates extraction state and batches proposals", async () => {
      const fixture = databaseFixture();
      const substages: ResumePersistenceSubstage[] = [];
      const repository = new PrismaResumeIngestionRepository(fixture.database);

      await repository.persistExtractedResume(
        {
          documentId: "document_fixture",
          extractionId: "extraction_fixture",
          extractedText: "SKILLS\nIncident response",
          pageCount: format === "PDF" ? 1 : null,
          proposals: [
            {
              confidence: 0.55,
              factType: "SKILL_TEXT",
              proposedValue: { text: "Incident response" },
              sourceRegion: {
                lineStart: 2,
                lineEnd: 2,
                text: "Incident response",
              },
              targetPath: "candidateFacts.skills",
            },
          ],
          userId: "user_fixture",
        },
        (substage) => substages.push(substage),
      );

      expect(fixture.operations).toEqual([
        "document_status_update",
        "extraction_status_update",
        "fact_proposal_persistence",
      ]);
      expect(substages).toEqual([
        "document_status_update",
        "extraction_status_update",
        "fact_proposal_persistence",
        "transaction_commit",
      ]);
      expect(fixture.transactionOptions()).toEqual({
        timeout: RESUME_PERSISTENCE_TRANSACTION_TIMEOUT_MS,
      });
      expect(fixture.proposalCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            documentId: "document_fixture",
            extractionId: "extraction_fixture",
            factType: "SKILL_TEXT",
            userId: "user_fixture",
          }),
        ],
      });
    });
  },
);

it("reports the exact substage when the first transaction operation expires", async () => {
  const fixture = databaseFixture({ failDocumentUpdate: true });
  const substages: ResumePersistenceSubstage[] = [];
  const repository = new PrismaResumeIngestionRepository(fixture.database);

  await expect(
    repository.persistExtractedResume(
      {
        documentId: "document_fixture",
        extractionId: "extraction_fixture",
        extractedText: "SKILLS\nIncident response",
        pageCount: 1,
        proposals: [],
        userId: "user_fixture",
      },
      (substage) => substages.push(substage),
    ),
  ).rejects.toMatchObject({ code: "P2028" });

  expect(substages).toEqual(["document_status_update"]);
  expect(fixture.extractionUpdate).not.toHaveBeenCalled();
  expect(fixture.proposalCreateMany).not.toHaveBeenCalled();
});

describe("failed résumé cleanup", () => {
  it("removes a rolled-back PROCESSING record before object cleanup", async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const findUnique = vi.fn();
    const database = {
      candidateDocument: { deleteMany, findUnique },
    } as unknown as PrismaClient;

    await expect(
      removeFailedResumeRecord(database, {
        storageKey: "candidate-documents/key_fixture",
        userId: "user_fixture",
      }),
    ).resolves.toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user_fixture",
        storageKey: "candidate-documents/key_fixture",
        status: "PROCESSING",
      },
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("retains the object when a non-PROCESSING database record remains", async () => {
    const database = {
      candidateDocument: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => ({ status: "EXTRACTED" })),
      },
    } as unknown as PrismaClient;

    await expect(
      removeFailedResumeRecord(database, {
        storageKey: "candidate-documents/key_fixture",
        userId: "user_fixture",
      }),
    ).resolves.toBe(false);
  });

  it("allows object cleanup when no database record was committed", async () => {
    const database = {
      candidateDocument: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => null),
      },
    } as unknown as PrismaClient;

    await expect(
      removeFailedResumeRecord(database, {
        storageKey: "candidate-documents/key_fixture",
        userId: "user_fixture",
      }),
    ).resolves.toBe(true);
  });
});
