import { describe, expect, it } from "vitest";
import {
  getProposalDestination,
  isSupportedProposalDestination,
  PROPOSAL_DESTINATIONS,
} from "./proposal-destinations";

describe("resume proposal destination mapping", () => {
  it.each([
    ["PROFILE_EMAIL", "candidateFacts.profileEmails"],
    ["SKILL_TEXT", "candidateFacts.skills"],
    ["EDUCATION_TEXT", "candidateFacts.education"],
    ["PROJECT_TEXT", "candidateFacts.projects"],
    ["WORK_EXPERIENCE_TEXT", "candidateFacts.workExperience"],
    ["CREDENTIAL_TEXT", "candidateFacts.credentials"],
  ])("maps %s to its canonical fact destination", (factType, targetPath) => {
    expect(getProposalDestination(factType)).toEqual(
      expect.objectContaining({ canonicalPath: targetPath }),
    );
    expect(isSupportedProposalDestination(factType, targetPath)).toBe(true);
  });

  it("keeps previously emitted proposal paths reviewable", () => {
    for (const [factType, destination] of Object.entries(
      PROPOSAL_DESTINATIONS,
    )) {
      for (const path of destination.legacyPaths) {
        expect(isSupportedProposalDestination(factType, path)).toBe(true);
      }
    }
  });

  it("does not treat unknown or mismatched destinations as supported", () => {
    expect(
      isSupportedProposalDestination("UNKNOWN", "candidateFacts.skills"),
    ).toBe(false);
    expect(isSupportedProposalDestination("SKILL_TEXT", "projects")).toBe(
      false,
    );
  });

  it("preserves one canonical fact per accepted source proposal", () => {
    expect(
      Object.values(PROPOSAL_DESTINATIONS).every(
        (destination) => destination.cardinality === "MULTIPLE",
      ),
    ).toBe(true);
  });
});
