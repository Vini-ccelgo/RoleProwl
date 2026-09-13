import { describe, expect, it } from "vitest";
import {
  applicationPacketCanBeReviewed,
  applicationTransferStatus,
  buildApplicationPacket,
  materialRequiredQuestionSchemaChanged,
  reconcileApplicationQuestionOverrides,
  type ApplicationPacketSource,
} from "./application-packet";

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
          },
        ],
      }),
    });
    expect(packet.answers[0]).toMatchObject({
      status: "RESOLVED",
      value: "Option B",
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
      externalTransferStatus: "HUMAN_REQUIRED",
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

  it("keeps plural multi-select external while preserving text and single-select behavior", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
        applicationOverrides: {
          identity: {},
          answers: {
            "standard:multi": "One",
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
          status: "CANDIDATE_REQUIRED_EXTERNAL",
          value: null,
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

  it("requires external consent but blocks an unsupported dynamic control", () => {
    const packet = buildApplicationPacket({
      reviewed: true,
      source: source({
        questions: [
          {
            id: "compliance:consent",
            source: "GREENHOUSE",
            group: "COMPLIANCE",
            label: "Consent",
            required: true,
            fieldNames: ["data_compliance[gdpr_consent_given]"],
            fieldTypes: ["external_consent"],
            options: [],
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
    expect(packet.answers[0]?.status).toBe("CANDIDATE_REQUIRED_EXTERNAL");
    expect(packet.answers[1]?.status).toBe("UNSUPPORTED");
    expect(packet.completeness.readyForSubmissionHandoff).toBe(false);
    expect(applicationPacketCanBeReviewed(packet)).toBe(false);
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
  });
});
