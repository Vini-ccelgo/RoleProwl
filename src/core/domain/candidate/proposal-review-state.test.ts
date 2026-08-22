import { describe, expect, it } from "vitest";
import {
  availableProposalActions,
  isProposalTextEdited,
} from "./proposal-review-state";

describe("proposal review UI state", () => {
  it("offers original acceptance only while the value is unchanged", () => {
    expect(
      availableProposalActions({
        original: "TypeScript",
        current: "TypeScript",
        supported: true,
      }),
    ).toEqual(["ACCEPT", "REJECT"]);
  });

  it("offers edited acceptance only after a material edit", () => {
    expect(
      availableProposalActions({
        original: "TypeScript",
        current: "TypeScript 5",
        supported: true,
      }),
    ).toEqual(["EDIT_AND_ACCEPT", "REJECT"]);
  });

  it("returns to unchanged state when the original is restored", () => {
    expect(isProposalTextEdited("TypeScript", " TypeScript ")).toBe(false);
    expect(
      availableProposalActions({
        original: "TypeScript",
        current: "TypeScript",
        supported: true,
      }),
    ).toEqual(["ACCEPT", "REJECT"]);
  });

  it("allows unsupported historical proposals to be rejected only", () => {
    expect(
      availableProposalActions({
        original: "value",
        current: "value",
        supported: false,
      }),
    ).toEqual(["REJECT"]);
  });
});
