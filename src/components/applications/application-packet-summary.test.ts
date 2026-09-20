import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { buildApplicationPacket } from "@/core/domain/applications/application-packet";
import { ApplicationPacketSummary } from "./application-packet-summary";

describe("application packet summary", () => {
  it("moves five approved Inter identity decisions into editable automatic preparation", () => {
    const concepts = [
      ["first_name", "Nome", "FIRST_NAME", "MAYA"],
      ["last_name", "Sobrenome", "LAST_NAME", "CHEN"],
      ["email", "E-mail", "APPLICATION_EMAIL", "maya.chen.test@example.com"],
      ["phone", "Telefone", "PHONE", "+1 (555) 014-2738"],
      [
        "linkedin",
        "LinkedIn Profile",
        "LINKEDIN_URL",
        "linkedin.com/in/maya-chen-test",
      ],
    ] as const;
    const questions = concepts.map(([id, label]) => ({
      id,
      source: "GREENHOUSE" as const,
      group: "STANDARD" as const,
      label,
      required: true,
      fieldNames: [id],
      fieldTypes: ["input_text"],
      options: [],
    }));
    const packet = buildApplicationPacket({
      reviewed: false,
      source: {
        accountEmail: "maya.chen.test@example.com",
        profile: {
          firstName: "MAYA",
          lastName: "CHEN",
          applicationEmail: "maya.chen.test@example.com",
          phone: "+1 (555) 014-2738",
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
        questions,
        questionResolutions: concepts.map(([id, , concept, value]) => ({
          questionId: id,
          canonicalConcept: concept,
          disposition: "AUTO_RESOLVED" as const,
          value,
          candidateKnowledgeReferences: [`${concept}:profile`],
          reasonCode: "APPROVED_REUSABLE_KNOWLEDGE",
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
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toMatch(/>5<\/strong><p[^>]*>Automatically prepared<\/p>/u);
    expect(markup).toMatch(/>0<\/strong><p[^>]*>Needs you<\/p>/u);
    expect(markup).toContain("Review or override prepared values");
    expect(markup).toContain('name="answer:first_name"');
    expect(markup).toContain('value="MAYA"');
    expect(markup).toContain('name="answer:linkedin"');
    expect(markup).toContain("without silently changing Career Profile");
  });

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
    expect(markup).toContain("Automatically prepared");
    expect(markup).toContain("Needs you");
    expect(markup).toContain("Complete on employer site");
    expect(markup).toContain("Ready / prepared");
    expect(markup).toContain("<details");
    expect(markup).toContain("/api/applications/application-1/resume");
    expect(markup).toContain("card grid gap-3 self-start p-5");
    expect(markup).not.toContain("candidate-documents/private-key");
  });

  it("wraps long residual questions and offers compact stale confirmation", () => {
    const longQuestion =
      "How comfortable are you conducting detailed professional security meetings in English with several collaborating engineering groups?";
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
            id: "standard:english",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: longQuestion,
            required: true,
            fieldNames: ["english_proficiency"],
            fieldTypes: ["input_text"],
            options: [],
          },
        ],
        questionResolutions: [
          {
            questionId: "standard:english",
            canonicalConcept: "LANGUAGE_PROFICIENCY:english",
            disposition: "CANDIDATE_REQUIRED",
            value: "Professional fluent",
            candidateKnowledgeReferences: ["memory-1"],
            reasonCode: "CANDIDATE_KNOWLEDGE_STALE",
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
        confirmKnowledgeAction: async () => undefined,
      }),
    );
    expect(markup).toContain("Reconfirm saved details");
    expect(markup).toContain("Still true");
    expect(markup).toContain("Confirm selected answers");
    expect(markup).toContain('name="questionId"');
    expect(markup).toContain("break-words");
    expect(markup).toContain("max-w-full min-w-0");
    expect(markup).toContain(longQuestion);
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
    expect(markup).toContain("Needs you");
    expect(markup).toContain('name="identity:phone"');
    expect(markup).toContain("Save and re-check application");
    expect(markup).not.toContain(">resolved<");
  });

  it("keeps prepared controls out of the primary unresolved task queue", () => {
    const questions = [
      {
        id: "country",
        source: "GREENHOUSE" as const,
        group: "STANDARD" as const,
        label: "Country",
        required: true,
        fieldNames: ["country"],
        fieldTypes: ["multi_value_single_select"],
        options: ["Brazil", "United States"],
      },
      {
        id: "notice",
        source: "GREENHOUSE" as const,
        group: "STANDARD" as const,
        label: "Notice period",
        required: true,
        fieldNames: ["notice_period"],
        fieldTypes: ["multi_value_single_select"],
        options: ["Immediately", "30 days"],
      },
    ];
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
        questions,
        questionResolutions: [
          {
            questionId: "country",
            canonicalConcept: "CURRENT_LOCATION",
            disposition: "AUTO_RESOLVED",
            value: "Brazil",
            candidateKnowledgeReferences: ["profile-location"],
            reasonCode: "SAME_FORM_CURRENT_RESIDENCE_CONTEXT",
          },
          {
            questionId: "notice",
            canonicalConcept: "NOTICE_PERIOD",
            disposition: "CANDIDATE_REQUIRED",
            value: null,
            candidateKnowledgeReferences: [],
            reasonCode: "CANDIDATE_KNOWLEDGE_MISSING",
          },
        ],
        questionInspection: "AVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Account Executive",
      },
    });
    const markup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-1",
        packet,
        saveAction: async () => undefined,
      }),
    );
    const needsStart = markup.indexOf('id="needs-you"');
    const preparedStart = markup.indexOf('id="prepared-fields"');
    const needsMarkup = markup.slice(needsStart, preparedStart);
    expect(needsMarkup).toContain("Notice period");
    expect(needsMarkup).toContain("not currently saved in your Career Profile");
    expect(needsMarkup).toContain("Reusable answer");
    expect(needsMarkup).not.toContain('name="answer:country"');
    expect(markup.slice(preparedStart)).toContain('name="answer:country"');
    expect(markup).toContain("Go to first");
  });

  it("explains incompatible compensation and labels a posted-range proposal", () => {
    const question = {
      id: "compensation",
      source: "GREENHOUSE" as const,
      group: "STANDARD" as const,
      label: "Expected annual base compensation (USD)",
      required: true,
      fieldNames: ["expected_compensation"],
      fieldTypes: ["input_text"],
      options: [],
    };
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
        questions: [question],
        questionResolutions: [
          {
            questionId: question.id,
            canonicalConcept: "DESIRED_SALARY",
            disposition: "PROPOSED_FOR_CANDIDATE",
            value: "USD 150,000 annual",
            candidateKnowledgeReferences: ["job:posted-compensation"],
            reasonCode: "EMPLOYER_POSTED_COMPENSATION_PROPOSAL",
          },
        ],
        questionInspection: "AVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Account Executive",
      },
    });
    const markup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-1",
        packet,
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toContain(
      "This job provides a compatible compensation range",
    );
    expect(markup).toContain("Based on compensation published with this job");
    expect(markup).toContain("requires your confirmation");
    expect(markup).toContain("Reusable answer");
    const mismatchMarkup = renderToStaticMarkup(
      createElement(ApplicationPacketSummary, {
        applicationId: "application-2",
        packet: {
          ...packet,
          answers: packet.answers.map((answer) => ({
            ...answer,
            value: null,
            resolutionDisposition: "CANDIDATE_REQUIRED",
            resolutionReasonCode: "COMPENSATION_CURRENCY_MISMATCH",
          })),
        },
        saveAction: async () => undefined,
      }),
    );
    expect(mismatchMarkup).toContain(
      "No compatible reusable compensation preference is saved in the employer&#x27;s requested currency",
    );
    expect(mismatchMarkup).toContain(
      "does not perform hidden currency conversion",
    );
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
    expect(markup).toContain("Review or override prepared values");
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

  it("counts and renders one candidate interaction for compatible duplicate controls", () => {
    const questions = [
      {
        id: "first_name",
        source: "GREENHOUSE" as const,
        group: "STANDARD" as const,
        label: "First name",
        required: true,
        fieldNames: ["first_name"],
        fieldTypes: ["input_text"],
        options: [],
      },
      {
        id: "nome",
        source: "GREENHOUSE" as const,
        group: "STANDARD" as const,
        label: "Nome",
        required: true,
        fieldNames: ["nome"],
        fieldTypes: ["input_text"],
        options: [],
      },
    ];
    const packet = buildApplicationPacket({
      reviewed: false,
      source: {
        accountEmail: "candidate@example.test",
        profile: {
          firstName: "",
          lastName: "Quill",
          applicationEmail: "candidate@example.test",
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
        questions,
        questionResolutions: questions.map((question) => ({
          questionId: question.id,
          canonicalConcept: "FIRST_NAME" as const,
          disposition: "CANDIDATE_REQUIRED" as const,
          value: null,
          candidateKnowledgeReferences: [],
          reasonCode: "CANDIDATE_KNOWLEDGE_MISSING",
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
        saveAction: async () => undefined,
      }),
    );
    expect(markup).toMatch(/>1<\/strong><p[^>]*>Needs you<\/p>/u);
    expect(markup).toContain('name="answer:first_name"');
    expect(markup).not.toContain('name="answer:nome"');
    expect(markup).not.toContain('name="identity:firstName"');
    expect(packet.answers.map((answer) => answer.questionId)).toEqual([
      "first_name",
      "nome",
    ]);
  });
});
