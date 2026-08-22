import { describe, expect, it } from "vitest";
import { proposalReviewRequestSchema } from "./proposal-review-request";

describe("proposal review request contract", () => {
  it("accepts each valid action shape", () => {
    expect(proposalReviewRequestSchema.parse({ decision: "ACCEPT" })).toEqual({
      decision: "ACCEPT",
    });
    expect(
      proposalReviewRequestSchema.parse({
        decision: "EDIT_AND_ACCEPT",
        editedValue: { text: "TypeScript 5" },
      }),
    ).toEqual({
      decision: "EDIT_AND_ACCEPT",
      editedValue: { text: "TypeScript 5" },
    });
    expect(proposalReviewRequestSchema.parse({ decision: "REJECT" })).toEqual({
      decision: "REJECT",
    });
  });

  it("rejects contradictory acceptance and rejection payloads", () => {
    expect(() =>
      proposalReviewRequestSchema.parse({
        decision: "ACCEPT",
        editedValue: { text: "changed" },
      }),
    ).toThrow();
    expect(() =>
      proposalReviewRequestSchema.parse({ decision: "EDIT_AND_ACCEPT" }),
    ).toThrow();
    expect(() =>
      proposalReviewRequestSchema.parse({
        decision: "REJECT",
        editedValue: { text: "changed" },
      }),
    ).toThrow();
  });
});
