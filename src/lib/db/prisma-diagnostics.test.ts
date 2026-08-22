import { describe, expect, it } from "vitest";
import { prismaFailureLogContext } from "./prisma-diagnostics";

describe("Prisma failure diagnostics", () => {
  it("retains bounded P2028 timing and model metadata", () => {
    const error = Object.assign(new Error("private candidate data"), {
      name: "PrismaClientKnownRequestError",
      code: "P2028",
      clientVersion: "7.9.1",
      meta: {
        modelName: "CandidateDocument",
        error:
          "Transaction already closed: A batch query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5265 ms passed.",
      },
    });

    const context = prismaFailureLogContext(
      error,
      "candidate_document_update",
      "document_status_update",
    );

    expect(context).toEqual({
      databaseOperation: "candidate_document_update",
      transactionSubstage: "document_status_update",
      prismaCode: "P2028",
      prismaModel: "CandidateDocument",
      prismaTarget: undefined,
      prismaConstraint: undefined,
      prismaField: undefined,
      prismaClientVersion: "7.9.1",
      transactionExpired: true,
      transactionTimeoutMs: 5000,
      transactionElapsedMs: 5265,
    });
    expect(JSON.stringify(context)).not.toContain("private candidate data");
    expect(JSON.stringify(context)).not.toContain("Transaction already closed");
  });

  it("selects safe constraint fields without serializing arbitrary metadata", () => {
    const context = prismaFailureLogContext(
      Object.assign(new Error("must not be logged"), {
        code: "P2002",
        clientVersion: "7.9.1",
        meta: {
          modelName: "CandidateFactProposal",
          target: ["documentId", "factType"],
          constraint: "CandidateFactProposal_documentId_factType_key",
          value: "synthetic@example.test",
        },
      }),
      "fact_proposal_create_many",
      "fact_proposal_persistence",
    );

    expect(context).toMatchObject({
      prismaCode: "P2002",
      prismaModel: "CandidateFactProposal",
      prismaTarget: "documentId,factType",
      prismaConstraint: "CandidateFactProposal_documentId_factType_key",
      transactionExpired: false,
    });
    const output = JSON.stringify(context);
    expect(output).not.toContain("synthetic@example.test");
    expect(output).not.toContain("must not be logged");
  });

  it("rejects unbounded model and constraint metadata", () => {
    const context = prismaFailureLogContext(
      Object.assign(new Error("failure"), {
        code: "NOT_A_PRISMA_CODE",
        meta: {
          modelName: "User",
          constraint: "unsafe constraint containing spaces",
          target: ["safeField", "unsafe field"],
        },
      }),
      "candidate_document_update",
      null,
    );

    expect(context).toMatchObject({
      prismaCode: undefined,
      prismaModel: undefined,
      prismaTarget: undefined,
      prismaConstraint: undefined,
    });
  });
});
