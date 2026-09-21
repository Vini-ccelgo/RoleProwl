import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCandidateKnowledgeCoverage } from "@/core/domain/candidate/candidate-knowledge";
import { buildEffectiveCandidateProfile } from "@/core/domain/candidate/effective-candidate-profile";
import type { CandidateTruthVault } from "@/integrations/candidate/prisma-truth-vault";
import type { getCandidateKnowledgeSnapshot } from "@/integrations/candidate/prisma-candidate-knowledge";
import { CandidateProfileOverview } from "./candidate-profile-overview";
import { ProfileDetailsSection } from "./truth-vault-sections";

type Snapshot = Awaited<ReturnType<typeof getCandidateKnowledgeSnapshot>>;
const now = new Date("2026-09-21T12:00:00.000Z");

function effectiveVault() {
  const effectiveProfile = buildEffectiveCandidateProfile({
    profile: null,
    facts: [
      {
        id: "first-name",
        factType: "PROFILE_FIRST_NAME",
        value: { text: "Maya" },
        updatedAt: now,
        sourceProposal: {
          document: { id: "resume-1", originalFileName: "resume.pdf" },
        },
      },
      {
        id: "last-name",
        factType: "PROFILE_LAST_NAME",
        value: { text: "Chen" },
        updatedAt: now,
      },
      {
        id: "email",
        factType: "PROFILE_EMAIL",
        value: { text: "maya@example.test" },
        updatedAt: now,
      },
      {
        id: "phone",
        factType: "PROFILE_PHONE",
        value: { text: "+55 11 99999-0000" },
        updatedAt: now,
      },
      {
        id: "linkedin",
        factType: "PROFILE_LINKEDIN_URL",
        value: { text: "linkedin.com/in/maya" },
        updatedAt: now,
      },
      {
        id: "location",
        factType: "PROFILE_LOCATION",
        value: { text: "São Paulo, Brazil" },
        updatedAt: now,
      },
      {
        id: "title",
        factType: "PROFILE_PROFESSIONAL_TITLE",
        value: { text: "Security Analyst" },
        updatedAt: now,
      },
    ],
  });
  return {
    profile: null,
    effectiveProfile,
    verifiedResumeFacts: [{ id: "fact-1" }],
  } as unknown as CandidateTruthVault;
}

describe("canonical Career Profile presentation", () => {
  it("populates editable Professional Details from effective résumé facts", () => {
    const markup = renderToStaticMarkup(
      createElement(ProfileDetailsSection, { vault: effectiveVault() }),
    );
    for (const value of [
      "Maya",
      "Chen",
      "maya@example.test",
      "+55 11 99999-0000",
      "São Paulo, Brazil",
      "Security Analyst",
      "https://linkedin.com/in/maya",
    ])
      expect(markup).toContain(`value="${value.replaceAll("&", "&amp;")}`);
    expect(markup).toContain("Imported from resume.pdf");
    expect(markup).toContain("noValidate");
    expect(markup).toContain("data-validation-message");
  });

  it("puts only missing or attention-worthy items in the primary action queue", () => {
    const coverage = buildCandidateKnowledgeCoverage({ evidence: [], now });
    const snapshot = {
      coverage,
    } as unknown as Snapshot;
    const markup = renderToStaticMarkup(
      createElement(CandidateProfileOverview, {
        snapshot,
        vault: effectiveVault(),
      }),
    );
    expect(markup).toContain("Finish these to reduce future application work");
    expect(markup).toContain("Worth completing");
    expect(markup).toContain('href="#personal"');
    expect(markup).not.toContain("Maya</strong>");
  });
});
