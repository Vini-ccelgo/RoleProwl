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
        questions: Array.from({ length: 8 }, (_, index) => ({
          id: `standard:question_${index + 1}`,
          source: "GREENHOUSE" as const,
          group: "STANDARD" as const,
          label: `Application question ${index + 1}`,
          required: true,
          fieldNames: [`question_${index + 1}`],
          fieldTypes: ["input_text"],
          options: [],
        })),
        questionInspection: "AVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Security Analyst",
      },
    });
    const markup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-1",
        packet,
        resumeDownloadAvailable: true,
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toContain("Avery");
    expect(markup).toContain("Incident response");
    expect(markup).toContain("Application question 8");
    expect(markup).toContain("/api/applications/application-1/resume");
    expect(markup).toContain("card grid gap-3 self-start p-5");
    expect(markup).not.toContain("candidate-documents/private-key");
  });

  it("does not render a download link without a canonical Application snapshot", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: {
        accountEmail: null,
        profile: null,
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
        resumeDownloadAvailable: false,
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toContain("resume.pdf");
    expect(markup).not.toContain("Download application résumé");
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
    expect(markup).toContain("disabled");
  });

  it("renders a legacy packet with absent answer arrays and provenance", () => {
    const packet = buildApplicationPacket({
      reviewed: false,
      source: {
        accountEmail: "candidate@example.test",
        profile: null,
        verifiedResumeFacts: [],
        experience: [],
        education: [],
        credentials: [],
        skills: [],
        languages: [],
        workAuthorization: null,
        sponsorshipRequired: null,
        answerMemories: [],
        selectedResume: null,
        coverLetter: null,
        questions: [],
        questionInspection: "UNAVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Analyst",
      },
    });
    const legacy = {
      ...packet,
      identity: packet.identity.map((field) => ({
        ...field,
        provenance: undefined,
      })),
      answers: undefined,
    };
    const markup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-1",
        packet: legacy,
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toContain("No public employer questions were represented");
    expect(markup).toContain("Application packet");
  });

  it("surfaces a preserved non-matching answer beside newly discovered choices", () => {
    const packet = buildApplicationPacket({
      reviewed: false,
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
          identity: {},
          answers: {
            "standard:question_42": "Kubernetes, AWS, Docker",
          },
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
        selectedResume: null,
        coverLetter: null,
        questions: [
          {
            id: "standard:question_42",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Which technologies have you used professionally?",
            required: true,
            fieldNames: ["question_42"],
            fieldTypes: ["multi_value_single_select"],
            options: ["Option A", "Option B"],
          },
        ],
        questionInspection: "AVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Analyst",
      },
    });
    const markup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-1",
        packet,
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toContain("Current answer:");
    expect(markup).toContain("Kubernetes, AWS, Docker");
    expect(markup).toContain("Choose a replacement explicitly");
    expect(markup).toContain("Option A");
    expect(markup).toContain("Option B");
  });

  it("renders known select and radio metadata on the first packet inspection", () => {
    const packet = buildApplicationPacket({
      reviewed: false,
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
        verifiedResumeFacts: [],
        experience: [],
        education: [],
        credentials: [],
        skills: [],
        languages: [],
        workAuthorization: null,
        sponsorshipRequired: null,
        answerMemories: [],
        selectedResume: null,
        coverLetter: null,
        questions: [
          {
            id: "standard:question_42",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Preferred shift",
            required: true,
            fieldNames: ["question_42"],
            fieldTypes: ["multi_value_single_select"],
            options: ["Day", "Night"],
          },
          {
            id: "standard:question_43",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Work arrangement",
            required: true,
            fieldNames: ["question_43"],
            fieldTypes: ["input_radio"],
            options: ["Remote", "Hybrid"],
          },
        ],
        questionInspection: "AVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Analyst",
      },
    });
    const markup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-1",
        packet,
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toContain("<select");
    expect(markup).toContain('name="answer:standard:question_42"');
    expect(markup).toContain('type="radio"');
    expect(markup).toContain('name="answer:standard:question_43"');
    expect(markup).toContain('data-dirty="false"');
    expect(markup).toContain("disabled");
  });
});
