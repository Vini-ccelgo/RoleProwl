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
});
