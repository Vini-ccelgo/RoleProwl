import { describe, expect, it } from "vitest";
import { buildEffectiveCandidateProfile } from "./effective-candidate-profile";

const now = new Date("2026-09-21T12:00:00.000Z");

function fact(id: string, factType: string, text: string) {
  return {
    id,
    factType,
    value: { text },
    updatedAt: now,
    sourceProposal: {
      document: { id: "resume-1", originalFileName: "maya-resume.pdf" },
    },
  };
}

describe("effective candidate profile", () => {
  it("populates a blank canonical field from one source-grounded fact", () => {
    const result = buildEffectiveCandidateProfile({
      profile: null,
      facts: [fact("fact-1", "PROFILE_FIRST_NAME", "Maya")],
    });
    expect(result.values.firstName).toMatchObject({
      value: "Maya",
      source: { kind: "RESUME", label: "Imported from maya-resume.pdf" },
      conflicts: [],
    });
  });

  it("keeps candidate-authored values authoritative and consolidates semantic agreement", () => {
    const result = buildEffectiveCandidateProfile({
      profile: {
        id: "profile-1",
        updatedAt: now,
        source: "USER_ENTERED",
        firstName: "Maya",
        lastName: "Chen",
        applicationEmail: null,
        professionalTitle: "Security",
        summary: null,
        phone: null,
        location: null,
        countryCode: null,
        websiteUrl: null,
        linkedInUrl: null,
      },
      facts: [fact("fact-1", "PROFILE_PROFESSIONAL_TITLE", " security ")],
    });
    expect(result.values.professionalTitle.value).toBe("Security");
    expect(result.values.professionalTitle.conflicts).toEqual([]);
    expect(result.values.professionalTitle.agreeingSources).toHaveLength(2);
  });

  it("surfaces genuine disagreement without overwriting the profile", () => {
    const result = buildEffectiveCandidateProfile({
      profile: {
        id: "profile-1",
        updatedAt: now,
        source: "USER_ENTERED",
        firstName: "Maya",
        lastName: "Chen",
        applicationEmail: null,
        professionalTitle: "Security",
        summary: null,
        phone: null,
        location: null,
        countryCode: null,
        websiteUrl: null,
        linkedInUrl: null,
      },
      facts: [fact("fact-1", "PROFILE_PROFESSIONAL_TITLE", "Sales")],
    });
    expect(result.values.professionalTitle.value).toBe("Security");
    expect(result.values.professionalTitle.conflicts).toMatchObject([
      { value: "Sales", source: { kind: "RESUME" } },
    ]);
  });
});
