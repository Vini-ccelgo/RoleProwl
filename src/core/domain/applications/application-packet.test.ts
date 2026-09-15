import { describe, expect, it } from "vitest";
import {
  applicationPacketCanBeReviewed,
  applicationAnswerCardinality,
  applicationQuestionHandoffClass,
  applicationQuestionControlDisposition,
  applicationTransferStatus,
  buildApplicationPacket,
  fanOutCompatibleApplicationAnswers,
  materialRequiredQuestionSchemaChanged,
  reconcileApplicationQuestionOverrides,
  semanticApplicationAnswerGroups,
  validatedApplicationAnswerValue,
  type ApplicationPacketAnswer,
  type ApplicationPacketSource,
} from "./application-packet";

describe("application answer cardinality", () => {
  const single = {
    label: "Preferred shift",
    required: true,
    fieldTypes: ["multi_value_single_select"],
    options: ["Day", "Night"],
    optionIdentities: [
      { label: "Day", value: "100" },
      { label: "Night", value: "200" },
    ],
  };
  const multiple = {
    ...single,
    label: "Preferred offices",
    fieldTypes: ["multi_value_multi_select"],
  };

  it("keeps single-select scalar and accepts unique label compatibility", () => {
    expect(applicationAnswerCardinality(single)).toBe("SINGLE");
    expect(validatedApplicationAnswerValue(single, ["100"])).toBe("100");
    expect(validatedApplicationAnswerValue(single, ["Night"])).toBe("200");
    expect(() =>
      validatedApplicationAnswerValue(single, ["100", "200"]),
    ).toThrow("Choose only one answer");
  });

  it("keeps multi-select as one canonical array and requires one, not all", () => {
    expect(applicationAnswerCardinality(multiple)).toBe("MULTIPLE");
    expect(validatedApplicationAnswerValue(multiple, ["100"])).toBe('["100"]');
    expect(validatedApplicationAnswerValue(multiple, ["100", "200"])).toBe(
      '["100","200"]',
    );
    expect(() => validatedApplicationAnswerValue(multiple, [])).toThrow(
      "Select or enter an answer",
    );
  });

  it("rejects option identities absent from the employer schema", () => {
    expect(() => validatedApplicationAnswerValue(single, ["forged"])).toThrow(
      "no longer available",
    );
  });
});

function source(
  overrides: Partial<ApplicationPacketSource> = {},
): ApplicationPacketSource {
  return {
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
    selectedResume: null,
    coverLetter: null,
    questions: [],
    questionInspection: "AVAILABLE",
    sourceName: "GREENHOUSE",
    targetRole: "Security Analyst",
    ...overrides,
  };
}

describe("application packet", () => {
  it("keeps CPF and national identifiers outside RoleProwl resolution", () => {
    const disposition = (label: string) =>
      applicationQuestionControlDisposition({
        id: `question:${label}`,
        source: "GREENHOUSE",
        group: "STANDARD",
        label,
        required: true,
        fieldNames: [label],
        fieldTypes: ["input_text"],
        options: [],
      });

    expect(disposition("CPF")).toBe("CANDIDATE_REQUIRED_EXTERNAL");
    expect(disposition("National identification number")).toBe(
      "CANDIDATE_REQUIRED_EXTERNAL",
    );
  });

  it("keeps a sparse candidate unresolved and not ready", () => {
    const packet = buildApplicationPacket({ source: source(), reviewed: true });
    expect(packet.completeness.readyForSubmissionHandoff).toBe(false);
    expect(packet.identity.filter((field) => field.required)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "firstName", status: "UNRESOLVED" }),
        expect.objectContaining({ key: "email", status: "UNRESOLVED" }),
      ]),
    );
  });

  it("uses accepted résumé facts while preserving explicit profile precedence", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
        accountEmail: "signin@example.test",
        profile: {
          firstName: "Avery",
          lastName: "Quill",
          applicationEmail: "apply@example.test",
          phone: "+1 555 0100",
          location: "Boston, MA",
          countryCode: "US",
          professionalTitle: "Security Analyst",
        },
        verifiedResumeFacts: [
          { factType: "PROFILE_EMAIL", text: "resume@example.test" },
          { factType: "SKILL_TEXT", text: "Incident response" },
        ],
        selectedResume: {
          fileName: "resume.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/safe",
          tailored: false,
        },
      }),
    });
    expect(
      packet.identity.find((field) => field.key === "email"),
    ).toMatchObject({
      status: "RESOLVED",
      value: "apply@example.test",
      alternatives: ["resume@example.test"],
    });
    expect(packet.professional.skills).toContain("Incident response");
    expect(packet.completeness.readyForSubmissionHandoff).toBe(true);
  });

  it("marks equal-precedence accepted email conflicts for review", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
        verifiedResumeFacts: [
          { factType: "PROFILE_EMAIL", text: "one@example.test" },
          { factType: "PROFILE_EMAIL", text: "two@example.test" },
        ],
      }),
    });
    expect(
      packet.identity.find((field) => field.key === "email"),
    ).toMatchObject({
      status: "CONFLICTING",
      value: null,
    });
  });

  it("does not use job-location preferences as residential location", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
        profile: {
          firstName: "Avery",
          lastName: "Quill",
          applicationEmail: null,
          phone: null,
          location: null,
          countryCode: null,
          professionalTitle: null,
        },
      }),
    });
    expect(
      packet.identity.find((field) => field.key === "location")?.value,
    ).toBeNull();
  });

  it("keeps CAPTCHA as a human step without fabricating a field value", () => {
    const packet = buildApplicationPacket({
      source: source(),
      reviewed: false,
    });
    expect(packet.transfer.humanSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "HUMAN_REQUIRED" }),
      ]),
    );
    expect(packet.transfer.fields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalFieldId: "captcha" }),
      ]),
    );
  });

  it("maps known external fields without claiming transfer", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
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
      }),
    });
    expect(packet.transfer.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalFieldId: "firstName",
          packetFieldKey: "firstName",
          status: "NOT_ATTEMPTED",
        }),
        expect.objectContaining({
          externalFieldId: "phone",
          status: "UNSUPPORTED",
        }),
      ]),
    );
  });

  it("does not treat an attempted or failed transfer as verified", () => {
    expect(
      applicationTransferStatus([
        {
          externalFieldId: "first_name",
          label: "First name",
          packetFieldKey: "firstName",
          status: "TRANSFERRED",
        },
      ]),
    ).toBe("TRANSFERRED");
    expect(
      applicationTransferStatus([
        {
          externalFieldId: "resume",
          label: "Résumé",
          packetFieldKey: "resume",
          status: "FAILED",
        },
      ]),
    ).toBe("FAILED");
  });

  it("uses an application-specific contact value without mutating the profile source", () => {
    const candidate = source({
      profile: {
        firstName: "Avery",
        lastName: "Quill",
        applicationEmail: "profile@example.test",
        phone: null,
        location: "Porto Alegre",
        countryCode: "BR",
        professionalTitle: null,
      },
      applicationOverrides: {
        identity: {
          email: "job-specific@example.test",
          phone: "+55 51 5555 0100",
        },
        answers: {},
      },
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
    });
    const packet = buildApplicationPacket({
      source: candidate,
      reviewed: false,
    });
    expect(
      packet.identity.find((field) => field.key === "email"),
    ).toMatchObject({
      value: "job-specific@example.test",
      provenance: [expect.objectContaining({ source: "APPLICATION_OVERRIDE" })],
      alternatives: ["profile@example.test"],
    });
    expect(
      packet.identity.find((field) => field.key === "phone"),
    ).toMatchObject({ status: "RESOLVED", value: "+55 51 5555 0100" });
    expect(candidate.profile?.phone).toBeNull();
    expect(candidate.profile?.applicationEmail).toBe("profile@example.test");
  });

  it("allows an explicit application answer to resolve a consequential question", () => {
    const question = {
      id: "standard:authorization",
      source: "GREENHOUSE" as const,
      group: "STANDARD" as const,
      label: "Are you legally authorized to work in the United States?",
      required: true,
      fieldNames: ["question_42"],
      fieldTypes: ["input_text"],
      options: ["Yes", "No"],
    };
    const unresolved = buildApplicationPacket({
      reviewed: false,
      source: source({
        questions: [question],
        verifiedResumeFacts: [
          { factType: "WORK_EXPERIENCE_TEXT", text: "Worked in New York" },
        ],
      }),
    });
    expect(unresolved.answers[0]).toMatchObject({
      classification: "LEGAL_OR_CONSEQUENTIAL",
      status: "UNRESOLVED",
    });
    const confirmed = buildApplicationPacket({
      reviewed: false,
      source: source({
        questions: [question],
        applicationOverrides: {
          identity: {},
          answers: { "standard:authorization": "Yes" },
        },
      }),
    });
    expect(confirmed.answers[0]).toMatchObject({
      classification: "LEGAL_OR_CONSEQUENTIAL",
      status: "RESOLVED",
      value: "Yes",
      provenance: [expect.objectContaining({ source: "APPLICATION_OVERRIDE" })],
    });
  });

  it("consumes resolver dispositions and transfers only approved resolved values", () => {
    const questions = [
      {
        id: "standard:english",
        source: "GREENHOUSE" as const,
        group: "STANDARD" as const,
        label: "English proficiency",
        required: true,
        fieldNames: ["english_proficiency"],
        fieldTypes: ["input_text"],
        options: [],
      },
      {
        id: "standard:communication",
        source: "GREENHOUSE" as const,
        group: "STANDARD" as const,
        label: "Describe how you communicate findings",
        required: true,
        fieldNames: ["communication"],
        fieldTypes: ["textarea"],
        options: [],
      },
    ];
    const packet = buildApplicationPacket({
      reviewed: false,
      source: source({
        questions,
        questionResolutions: [
          {
            questionId: "standard:english",
            canonicalConcept: "LANGUAGE_PROFICIENCY:english",
            disposition: "AUTO_RESOLVED",
            value: "Professional fluent",
            candidateKnowledgeReferences: ["english-memory"],
            reasonCode: "APPROVED_REUSABLE_KNOWLEDGE",
          },
          {
            questionId: "standard:communication",
            canonicalConcept: "REUSABLE_SELF_DESCRIPTION",
            disposition: "PROPOSED_FOR_CANDIDATE",
            value: "I communicate findings to engineering teams.",
            candidateKnowledgeReferences: ["summary-memory"],
            reasonCode: "AI_GROUNDED_REFRAME_APPROVAL_REQUIRED",
          },
        ],
      }),
    });
    expect(packet.answers[0]).toMatchObject({
      status: "RESOLVED",
      resolutionDisposition: "AUTO_RESOLVED",
      canonicalConcept: "LANGUAGE_PROFICIENCY:english",
    });
    expect(packet.answers[1]).toMatchObject({
      status: "UNRESOLVED",
      resolutionDisposition: "PROPOSED_FOR_CANDIDATE",
    });
    expect(
      packet.transfer.fields.find(
        (field) => field.externalFieldId === "standard:english",
      ),
    ).toMatchObject({ status: "NOT_ATTEMPTED" });
    expect(
      packet.transfer.fields.find(
        (field) => field.externalFieldId === "standard:communication",
      ),
    ).toMatchObject({ status: "UNSUPPORTED" });
  });

  it("keeps an application-specific override above an AI proposal", () => {
    const packet = buildApplicationPacket({
      reviewed: false,
      source: source({
        applicationOverrides: {
          identity: {},
          answers: { "standard:communication": "Candidate-approved answer" },
        },
        questions: [
          {
            id: "standard:communication",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Describe how you communicate findings",
            required: true,
            fieldNames: ["communication"],
            fieldTypes: ["textarea"],
            options: [],
          },
        ],
        questionResolutions: [
          {
            questionId: "standard:communication",
            canonicalConcept: "REUSABLE_SELF_DESCRIPTION",
            disposition: "PROPOSED_FOR_CANDIDATE",
            value: "AI proposal",
            candidateKnowledgeReferences: ["summary-memory"],
            reasonCode: "AI_GROUNDED_REFRAME_APPROVAL_REQUIRED",
          },
        ],
      }),
    });
    expect(packet.answers[0]).toMatchObject({
      status: "RESOLVED",
      value: "Candidate-approved answer",
      provenance: [expect.objectContaining({ source: "APPLICATION_OVERRIDE" })],
    });
  });

  it("preserves an explicit answer across stable logical question metadata changes", () => {
    const previous = buildApplicationPacket({
      reviewed: false,
      source: source({
        applicationOverrides: {
          identity: {},
          answers: { "standard:1": "Kubernetes, AWS, Docker" },
        },
        questions: [
          {
            id: "standard:1",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Which technologies have you used professionally?",
            required: true,
            fieldNames: [],
            fieldTypes: ["input_text"],
            options: [],
          },
        ],
      }),
    });
    const refreshedQuestion = {
      id: "standard:question_42",
      source: "GREENHOUSE" as const,
      group: "STANDARD" as const,
      label: "Which technologies have you used professionally?",
      required: true,
      fieldNames: ["question_42"],
      fieldTypes: ["multi_value_single_select"],
      options: ["Option A", "Option B", "Option C"],
    };
    const overrides = reconcileApplicationQuestionOverrides({
      overrides: {
        identity: {},
        answers: { "standard:1": "Kubernetes, AWS, Docker" },
      },
      previousAnswers: previous.answers,
      questions: [refreshedQuestion],
    });
    expect(overrides.answers).toEqual({
      "standard:question_42": "Kubernetes, AWS, Docker",
    });
    const refreshed = buildApplicationPacket({
      reviewed: false,
      source: source({
        applicationOverrides: overrides,
        questions: [refreshedQuestion],
      }),
    });
    expect(refreshed.answers[0]).toMatchObject({
      status: "CONFLICTING",
      value: "Kubernetes, AWS, Docker",
      options: ["Option A", "Option B", "Option C"],
    });
    expect(refreshed.completeness.needsReview).toBeGreaterThan(0);
  });

  it("keeps an exact candidate answer selected when choice metadata appears", () => {
    const packet = buildApplicationPacket({
      reviewed: false,
      source: source({
        applicationOverrides: {
          identity: {},
          answers: { "standard:question_42": "Option B" },
        },
        questions: [
          {
            id: "standard:question_42",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Preferred shift",
            required: true,
            fieldNames: ["question_42"],
            fieldTypes: ["multi_value_single_select"],
            options: ["Option A", "Option B"],
            optionIdentities: [
              { label: "Option A", value: "option-a-id" },
              { label: "Option B", value: "option-b-id" },
            ],
          },
        ],
      }),
    });
    expect(packet.answers[0]).toMatchObject({
      status: "RESOLVED",
      value: "option-b-id",
    });
  });

  it("identifies an intended résumé without claiming the external file control is complete", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
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
        selectedResume: {
          fileName: "resume.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/resume",
          tailored: false,
        },
        questions: [
          {
            id: "standard:resume",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Résumé/CV",
            required: true,
            fieldNames: ["resume"],
            fieldTypes: ["input_file", "textarea"],
            options: [],
          },
        ],
      }),
    });
    expect(packet.documents[0]).toMatchObject({
      status: "RESOLVED",
      externalTransferStatus: "NOT_ATTEMPTED",
    });
    expect(packet.answers[0]).toMatchObject({
      status: "CANDIDATE_REQUIRED_EXTERNAL",
      value: "resume.pdf",
      controlDisposition: "CANDIDATE_REQUIRED_EXTERNAL",
    });
    expect(packet.completeness.readyForSubmissionHandoff).toBe(true);
  });

  it.each([
    ["Portfolio attachment", "portfolio", "portfolio.pdf"],
    ["Cover letter", "cover_letter", "I wrote a cover letter"],
  ])(
    "does not let a scalar override resolve required file control %s",
    (label, fieldName, override) => {
      const packet = buildApplicationPacket({
        reviewed: true,
        source: source({
          applicationOverrides: {
            identity: {},
            answers: { "standard:file": override },
          },
          questions: [
            {
              id: "standard:file",
              source: "GREENHOUSE",
              group: "STANDARD",
              label,
              required: true,
              fieldNames: [fieldName],
              fieldTypes: ["input_file"],
              options: [],
            },
          ],
        }),
      });
      expect(packet.answers[0]).toMatchObject({
        status: "CANDIDATE_REQUIRED_EXTERNAL",
        value: null,
      });
    },
  );

  it("supports stable multi-select while preserving text and single-select behavior", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
        accountEmail: "avery@example.test",
        profile: {
          firstName: "Avery",
          lastName: "Quill",
          applicationEmail: null,
          phone: null,
          location: null,
          countryCode: null,
          professionalTitle: null,
        },
        selectedResume: {
          fileName: "resume.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/private",
          tailored: false,
        },
        applicationOverrides: {
          identity: {},
          answers: {
            "standard:multi": '["One","Two"]',
            "standard:single": "Two",
            "standard:text": "Prepared answer",
          },
        },
        questions: [
          {
            id: "standard:multi",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Select all",
            required: true,
            fieldNames: ["multi"],
            fieldTypes: ["multi_value_multi_select"],
            options: ["One", "Two"],
          },
          {
            id: "standard:single",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Select one",
            required: true,
            fieldNames: ["single"],
            fieldTypes: ["multi_value_single_select"],
            options: ["One", "Two"],
          },
          {
            id: "standard:text",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Required text",
            required: true,
            fieldNames: ["text"],
            fieldTypes: ["input_text"],
            options: [],
          },
          {
            id: "standard:optional",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Optional text",
            required: false,
            fieldNames: ["optional"],
            fieldTypes: ["input_text"],
            options: [],
          },
        ],
      }),
    });
    expect(packet.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          questionId: "standard:multi",
          status: "RESOLVED",
          value: '["One","Two"]',
        }),
        expect.objectContaining({
          questionId: "standard:single",
          status: "RESOLVED",
          value: "Two",
        }),
        expect.objectContaining({
          questionId: "standard:text",
          status: "RESOLVED",
        }),
        expect.objectContaining({
          questionId: "standard:optional",
          status: "NOT_REQUIRED",
        }),
      ]),
    );
  });

  it("collects exact consent in RoleProwl while leaving dynamic controls external", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
        accountEmail: "avery@example.test",
        profile: {
          firstName: "Avery",
          lastName: "Quill",
          applicationEmail: null,
          phone: null,
          location: null,
          countryCode: null,
          professionalTitle: null,
        },
        selectedResume: {
          fileName: "resume.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/private",
          tailored: false,
        },
        applicationOverrides: {
          identity: {},
          answers: { "compliance:consent": "false" },
        },
        questions: [
          {
            id: "compliance:consent",
            source: "GREENHOUSE",
            group: "COMPLIANCE",
            label: "Consent",
            required: true,
            fieldNames: ["data_compliance[gdpr_consent_given]"],
            fieldTypes: ["external_consent"],
            options: ["Yes", "No"],
            optionIdentities: [
              { label: "Yes", value: "true" },
              { label: "No", value: "false" },
            ],
          },
          {
            id: "standard:widget",
            source: "GREENHOUSE",
            group: "STANDARD",
            label: "Employer widget",
            required: true,
            fieldNames: ["widget"],
            fieldTypes: ["dynamic_widget"],
            options: [],
          },
        ],
      }),
    });
    expect(packet.answers[0]).toMatchObject({
      status: "RESOLVED",
      value: "false",
    });
    expect(packet.answers[0]).not.toHaveProperty("canonicalConcept");
    expect(applicationQuestionHandoffClass(packet.answers[0]!)).toBe(
      "CANDIDATE_DECIDES_THEN_ROLEPROWL_TRANSFERS",
    );
    expect(packet.answers[1]?.status).toBe("CANDIDATE_REQUIRED_EXTERNAL");
    expect(applicationQuestionHandoffClass(packet.answers[1]!)).toBe(
      "IRREDUCIBLE_EMPLOYER_SITE_STEP",
    );
    expect(packet.completeness.readyForSubmissionHandoff).toBe(true);
    expect(applicationPacketCanBeReviewed(packet)).toBe(true);
  });

  it("classifies every Inter-style beta control and reduces employer-site work to irreducible steps", () => {
    const questions = [
      ["first", "First name", "first_name", "input_text", []],
      ["last", "Last name", "last_name", "input_text", []],
      ["email", "Email", "email", "input_text", []],
      ["phone", "Phone", "phone", "input_text", []],
      ["linkedin", "LinkedIn", "linkedin", "input_text", []],
      ["cpf", "CPF", "cpf", "input_text", []],
      [
        "current-employer",
        "Do you currently work at Inter?",
        "current_employer",
        "input_radio",
        ["Yes", "No"],
      ],
      [
        "employee-name",
        "If yes, what is the employee's full name?",
        "employee_name",
        "input_text",
        [],
      ],
      [
        "english",
        "English proficiency",
        "english",
        "multi_value_single_select",
        ["Basic", "Fluent"],
      ],
      [
        "spanish",
        "Spanish proficiency",
        "spanish",
        "multi_value_single_select",
        ["Basic", "Advanced"],
      ],
      [
        "education",
        "Have you completed higher education?",
        "education",
        "input_radio",
        ["Yes", "No"],
      ],
      ["salary", "Current salary", "salary", "input_text", []],
      ["benefits", "Current benefits", "benefits", "textarea", []],
      [
        "privacy",
        "Inter privacy consent",
        "privacy_consent",
        "external_consent",
        ["Yes", "No"],
      ],
      [
        "ai-consent",
        "AI interview transcription consent",
        "ai_consent",
        "external_consent",
        ["Yes", "No"],
      ],
      ["resume", "Résumé/CV", "resume", "input_file", []],
      [
        "location-widget",
        "Location autocomplete",
        "location_widget",
        "dynamic_widget",
        [],
      ],
    ].map(([id, label, fieldName, fieldType, options]) => ({
      id: String(id),
      source: "GREENHOUSE" as const,
      group:
        id === "privacy" || id === "ai-consent"
          ? ("COMPLIANCE" as const)
          : id === "location-widget"
            ? ("LOCATION" as const)
            : ("STANDARD" as const),
      label: String(label),
      required: id !== "employee-name",
      fieldNames: [String(fieldName)],
      fieldTypes: [String(fieldType)],
      options: options as string[],
    }));
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
        accountEmail: "avery@example.test",
        profile: {
          firstName: "Avery",
          lastName: "Quill",
          applicationEmail: null,
          phone: "+55 11 5555-0100",
          location: "São Paulo",
          countryCode: "BR",
          professionalTitle: null,
        },
        selectedResume: {
          fileName: "avery-resume.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/private",
          tailored: false,
        },
        questions,
        questionResolutions: [
          {
            questionId: "linkedin",
            canonicalConcept: "LINKEDIN_URL",
            disposition: "AUTO_RESOLVED",
            value: "https://linkedin.example/avery",
            candidateKnowledgeReferences: ["profile:linkedin"],
            reasonCode: "APPROVED_REUSABLE_KNOWLEDGE",
          },
          {
            questionId: "english",
            canonicalConcept: "LANGUAGE_PROFICIENCY:english",
            disposition: "AUTO_RESOLVED",
            value: "Fluent",
            candidateKnowledgeReferences: ["language:english"],
            reasonCode: "APPROVED_REUSABLE_KNOWLEDGE",
          },
        ],
        applicationOverrides: {
          identity: {},
          answers: {
            "current-employer": "No",
            spanish: "Advanced",
            education: "Yes",
            salary: "R$ 12.000",
            benefits: "Health and meal allowance",
            privacy: "No",
            "ai-consent": "No",
          },
        },
      }),
    });
    const classified = Object.fromEntries(
      packet.answers.map((answer) => [
        answer.label,
        applicationQuestionHandoffClass(answer),
      ]),
    );
    expect(classified).toMatchObject({
      "First name": "ROLEPROWL_CAN_COMPLETE",
      "Last name": "ROLEPROWL_CAN_COMPLETE",
      Email: "ROLEPROWL_CAN_COMPLETE",
      Phone: "ROLEPROWL_CAN_COMPLETE",
      LinkedIn: "ROLEPROWL_CAN_COMPLETE",
      "Do you currently work at Inter?":
        "CANDIDATE_DECIDES_THEN_ROLEPROWL_TRANSFERS",
      "Spanish proficiency": "CANDIDATE_DECIDES_THEN_ROLEPROWL_TRANSFERS",
      "Current salary": "CANDIDATE_DECIDES_THEN_ROLEPROWL_TRANSFERS",
      "Current benefits": "CANDIDATE_DECIDES_THEN_ROLEPROWL_TRANSFERS",
      "Inter privacy consent": "CANDIDATE_DECIDES_THEN_ROLEPROWL_TRANSFERS",
      "AI interview transcription consent":
        "CANDIDATE_DECIDES_THEN_ROLEPROWL_TRANSFERS",
      "Résumé/CV": "ROLEPROWL_CAN_COMPLETE",
      CPF: "IRREDUCIBLE_EMPLOYER_SITE_STEP",
      "Location autocomplete": "IRREDUCIBLE_EMPLOYER_SITE_STEP",
    });
    expect(
      Object.values(classified).filter(
        (classification) => classification === "IRREDUCIBLE_EMPLOYER_SITE_STEP",
      ),
    ).toHaveLength(2);
    expect(packet.completeness).toMatchObject({
      needsReview: 0,
      readyForSubmissionHandoff: true,
    });
  });

  it("blocks Greenhouse readiness when current question inspection is unavailable", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
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
        selectedResume: {
          fileName: "resume.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/resume",
          tailored: false,
        },
        questionInspection: "UNAVAILABLE",
      }),
    });
    expect(packet.completeness.readyForSubmissionHandoff).toBe(false);
    expect(applicationPacketCanBeReviewed(packet)).toBe(false);
  });

  it("compares only deterministic material required-question schema", () => {
    const question = {
      id: "standard:old-id",
      source: "GREENHOUSE" as const,
      group: "STANDARD" as const,
      label: "Preferred shift",
      required: true,
      fieldNames: ["question_42"],
      fieldTypes: ["multi_value_single_select"],
      options: ["Day", "Night"],
    };
    const previous = buildApplicationPacket({
      reviewed: false,
      source: source({ questions: [question] }),
    });
    expect(
      materialRequiredQuestionSchemaChanged({
        previousAnswers: previous.answers,
        questions: [{ ...question, id: "standard:new-id" }],
      }),
    ).toBe(false);
    expect(
      materialRequiredQuestionSchemaChanged({
        previousAnswers: previous.answers,
        questions: [{ ...question, options: ["Day", "Night", "Flexible"] }],
      }),
    ).toBe(true);
    expect(
      materialRequiredQuestionSchemaChanged({
        previousAnswers: buildApplicationPacket({
          reviewed: false,
          source: source({
            questions: [
              {
                ...question,
                optionIdentities: [
                  { label: "Day", value: "day-v1" },
                  { label: "Night", value: "night-v1" },
                ],
              },
            ],
          }),
        }).answers,
        questions: [
          {
            ...question,
            optionIdentities: [
              { label: "Day", value: "day-v2" },
              { label: "Night", value: "night-v1" },
            ],
          },
        ],
      }),
    ).toBe(true);
  });
});

describe("semantic employer question groups", () => {
  function answer(
    questionId: string,
    overrides: Partial<ApplicationPacketAnswer> = {},
  ): ApplicationPacketAnswer {
    return {
      key: `question:${questionId}`,
      questionId,
      label: questionId,
      required: true,
      status: "UNRESOLVED",
      value: null,
      provenance: [],
      classification: "CANDIDATE_KNOWLEDGE",
      fieldNames: [questionId],
      fieldTypes: ["input_text"],
      options: [],
      canonicalConcept: "FIRST_NAME",
      ...overrides,
    };
  }

  it("coalesces compatible duplicate concepts while retaining every employer ID", () => {
    const groups = semanticApplicationAnswerGroups([
      answer("first_name", { label: "First name" }),
      answer("nome", { label: "Nome", fieldTypes: ["textarea"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.answers.map((item) => item.questionId)).toEqual([
      "first_name",
      "nome",
    ]);
  });

  it("does not coalesce materially incompatible choice taxonomies", () => {
    const groups = semanticApplicationAnswerGroups([
      answer("english_a", {
        canonicalConcept: "LANGUAGE_PROFICIENCY:english",
        fieldTypes: ["input_radio"],
        options: ["Basic", "Fluent"],
      }),
      answer("english_b", {
        canonicalConcept: "LANGUAGE_PROFICIENCY:english",
        fieldTypes: ["multi_value_single_select"],
        options: ["A1", "A2", "B1", "B2", "C1", "C2"],
      }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("does not fan out choices whose labels match but raw employer identities differ", () => {
    const groups = semanticApplicationAnswerGroups([
      answer("choice_a", {
        canonicalConcept: "LANGUAGE_PROFICIENCY:english",
        fieldTypes: ["multi_value_single_select"],
        options: ["Fluent"],
        optionIdentities: [{ label: "Fluent", value: "100" }],
      }),
      answer("choice_b", {
        canonicalConcept: "LANGUAGE_PROFICIENCY:english",
        fieldTypes: ["multi_value_single_select"],
        options: ["Fluent"],
        optionIdentities: [{ label: "Fluent", value: "200" }],
      }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("fans one candidate answer out to all compatible employer controls", () => {
    const answers = [answer("first_name"), answer("nome")];
    expect(
      fanOutCompatibleApplicationAnswers(answers, [
        { key: "first_name", value: "Avery" },
      ]),
    ).toEqual([
      { key: "first_name", value: "Avery" },
      { key: "nome", value: "Avery" },
    ]);
  });
});
