import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { buildApplicationPacket } from "@/core/domain/applications/application-packet";
import { ApplicationPacketSummary } from "./application-packet-summary";

describe("application packet summary", () => {
  it("shows functional fields and download access without private storage keys", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: {
        accountEmail: "candidate@example.test",
        profile: {
          firstName: "Avery",
          lastName: "Quill",
          applicationEmail: null,
          phone: "+1 555 0100",
          location: "Boston, MA",
          countryCode: "US",
          professionalTitle: "Security Analyst",
        },
        verifiedResumeFacts: [
          { factType: "SKILL_TEXT", text: "Incident response" },
        ],
        experience: [],
        education: [],
        credentials: [],
        skills: [],
        languages: [],
        workAuthorization: null,
        sponsorshipRequired: null,
        answerMemories: [],
        selectedResume: {
          fileName: "resume.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/private-key",
          tailored: false,
        },
        coverLetter: null,
        questions: [],
        questionInspection: "AVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Security Analyst",
      },
    });
    const markup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-1",
        packet,
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toContain("Avery");
    expect(markup).toContain("Incident response");
    expect(markup).toContain("/api/applications/application-1/resume");
    expect(markup).not.toContain("candidate-documents/private-key");
  });

  it("makes blocking fields actionable without repeating resolved badges", () => {
    const packet = buildApplicationPacket({
      reviewed: false,
      source: {
        accountEmail: "candidate@example.test",
        profile: {
          firstName: "Avery",
          lastName: "Quill",
          applicationEmail: null,
          phone: null,
          location: "Boston",
          countryCode: "US",
          professionalTitle: null,
        },
        verifiedResumeFacts: [],
        experience: [],
        education: [],
        credentials: [],
        skills: [],
        languages: [],
        workAuthorization: null,
        sponsorshipRequired: null,
        answerMemories: [],
        selectedResume: {
          fileName: "resume.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/private-key",
          tailored: false,
        },
        coverLetter: null,
        questions: [
          {
            id: "standard:phone",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Phone",
            required: true,
            fieldNames: ["phone"],
            fieldTypes: ["input_text"],
            options: [],
          },
        ],
        questionInspection: "AVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Security Analyst",
      },
    });
    const markup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-1",
        packet,
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toContain("Needs your input");
    expect(markup).toContain('name="identity:phone"');
    expect(markup).toContain("Save and re-check application");
    expect(markup).not.toContain(">resolved<");
  });

  it("keeps resolved Application overrides editable for later review invalidation", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: {
        accountEmail: "candidate@example.test",
        profile: {
          firstName: "Avery",
          lastName: "Quill",
          applicationEmail: null,
          phone: null,
          location: null,
          countryCode: null,
          professionalTitle: null,
        },
        applicationOverrides: {
          identity: { phone: "+55 51 5555 0100" },
          answers: {},
        },
        verifiedResumeFacts: [],
        experience: [],
        education: [],
        credentials: [],
        skills: [],
        languages: [],
        workAuthorization: null,
        sponsorshipRequired: null,
        answerMemories: [],
        selectedResume: {
          fileName: "resume.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/private-key",
          tailored: false,
        },
        coverLetter: null,
        questions: [
          {
            id: "standard:phone",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Phone",
            required: true,
            fieldNames: ["phone"],
            fieldTypes: ["input_text"],
            options: [],
          },
        ],
        questionInspection: "AVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Security Analyst",
      },
    });
    const markup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-1",
        packet,
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toContain("Application-specific values");
    expect(markup).toContain('name="identity:phone"');
    expect(markup).toContain('value="+55 51 5555 0100"');
  });
});
