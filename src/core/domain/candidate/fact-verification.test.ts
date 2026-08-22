import { describe, expect, it } from "vitest";
import {
  decideFactProposal,
  type ReviewableProposal,
} from "./fact-verification";

const proposal: ReviewableProposal = {
  id: "proposal-1",
  userId: "user-1",
  factType: "SKILL_TEXT",
  proposedValue: { text: "TypeScript" },
  status: "PENDING",
  targetPath: "candidateFacts.skills",
};

describe("candidate fact proposal decisions", () => {
  it("accepts the extracted value into a canonical-fact instruction", () => {
    expect(decideFactProposal(proposal, "user-1", "ACCEPT")).toEqual({
      status: "ACCEPTED",
      acceptedValue: { text: "TypeScript" },
      createCanonicalFact: true,
    });
  });

  it("preserves an edited accepted value separately", () => {
    expect(
      decideFactProposal(proposal, "user-1", "EDIT_AND_ACCEPT", {
        text: "TypeScript 5",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "EDITED_AND_ACCEPTED",
        acceptedValue: { text: "TypeScript 5" },
      }),
    );
  });

  it("retains rejection as history without canonicalizing", () => {
    expect(decideFactProposal(proposal, "user-1", "REJECT")).toEqual({
      status: "REJECTED",
      acceptedValue: null,
      createCanonicalFact: false,
    });
  });

  it("rejects foreign, repeated, and empty edited decisions", () => {
    expect(() => decideFactProposal(proposal, "other", "ACCEPT")).toThrow(
      "not found",
    );
    expect(() =>
      decideFactProposal(
        { ...proposal, status: "ACCEPTED" },
        "user-1",
        "ACCEPT",
      ),
    ).toThrow("already been reviewed");
    expect(() =>
      decideFactProposal(proposal, "user-1", "EDIT_AND_ACCEPT", { text: " " }),
    ).toThrow("non-empty");
  });

  it("enforces distinct original, edited, and rejected payload semantics", () => {
    expect(() =>
      decideFactProposal(proposal, "user-1", "ACCEPT", {
        text: "TypeScript 5",
      }),
    ).toThrow("cannot include a modified");
    expect(() =>
      decideFactProposal(proposal, "user-1", "EDIT_AND_ACCEPT", {
        text: " TypeScript ",
      }),
    ).toThrow("differs from the original");
    expect(() =>
      decideFactProposal(proposal, "user-1", "REJECT", {
        text: "TypeScript 5",
      }),
    ).toThrow("cannot include an edited value");
  });

  it("rejects unsupported acceptance while still permitting rejection", () => {
    const unsupported = {
      ...proposal,
      factType: "UNKNOWN_TEXT",
      targetPath: "unknown",
    };
    expect(() => decideFactProposal(unsupported, "user-1", "ACCEPT")).toThrow(
      "does not have a supported",
    );
    expect(decideFactProposal(unsupported, "user-1", "REJECT")).toEqual(
      expect.objectContaining({
        status: "REJECTED",
        createCanonicalFact: false,
      }),
    );
  });
});
