import { describe, expect, it } from "vitest";
import { buildApplicationPacket } from "./application-packet";
import { buildGreenhouseTransferDraft } from "./greenhouse-transfer";

function readyPacket() {
  return buildApplicationPacket({
    reviewed: true,
    source: {
      accountEmail: null,
      profile: {
        firstName: "Avery",
        lastName: "Quill",
        applicationEmail: "avery@example.test",
        phone: "+1 555 0100",
        location: "Boston",
        countryCode: "US",
        professionalTitle: "Security Analyst",
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
        fileName: "avery-resume.pdf",
        contentType: "application/pdf",
        storageKey: "candidate-documents/private",
        tailored: false,
      },
      coverLetter: null,
      questions: [
        {
          id: "standard:first_name",
          source: "GREENHOUSE",
          group: "STANDARD",
          label: "First Name",
          required: true,
          fieldNames: ["first_name"],
          fieldTypes: ["input_text"],
          options: [],
        },
        {
          id: "standard:last_name",
          source: "GREENHOUSE",
          group: "STANDARD",
          label: "Last Name",
          required: true,
          fieldNames: ["last_name"],
          fieldTypes: ["input_text"],
          options: [],
        },
        {
          id: "standard:email",
          source: "GREENHOUSE",
          group: "STANDARD",
          label: "Email",
          required: true,
          fieldNames: ["email"],
          fieldTypes: ["input_text"],
          options: [],
        },
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
        {
          id: "location:candidate-location",
          source: "GREENHOUSE",
          group: "LOCATION",
          label: "Location",
          required: true,
          fieldNames: ["candidate-location"],
          fieldTypes: ["input_text"],
          options: [],
        },
        {
          id: "standard:question_42",
          source: "GREENHOUSE",
          group: "STANDARD",
          label: "Preferred shift",
          required: true,
          fieldNames: ["question_42"],
          fieldTypes: ["input_text"],
          options: [],
        },
      ],
      applicationOverrides: {
        identity: {},
        answers: { "standard:question_42": "Day" },
      },
      questionInspection: "AVAILABLE",
      sourceName: "GREENHOUSE",
      targetRole: "Security Analyst",
    },
  });
}

describe("Greenhouse assisted transfer draft", () => {
  it("exposes only resolved field values and no private storage key", () => {
    const draft = buildGreenhouseTransferDraft({
      packet: readyPacket(),
      destination: "https://job-boards.greenhouse.io/acme/jobs/42#apply",
    });
    expect(draft.destination).toBe(
      "https://job-boards.greenhouse.io/acme/jobs/42",
    );
    expect(draft.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "identity:firstName",
          value: "Avery",
        }),
        expect.objectContaining({
          id: "answer:standard:question_42",
          fieldNames: ["question_42"],
          value: "Day",
        }),
      ]),
    );
    expect(
      draft.fields.find((field) => field.id === "identity:location"),
    ).toEqual(
      expect.objectContaining({
        fieldNames: expect.arrayContaining(["candidate-location"]),
      }),
    );
    expect(draft.fields.map((field) => field.id)).not.toEqual(
      expect.arrayContaining([
        "answer:standard:first_name",
        "answer:standard:last_name",
        "answer:standard:email",
        "answer:standard:phone",
        "answer:location:candidate-location",
      ]),
    );
    expect(
      draft.fields.filter((field) => field.id.startsWith("identity:")),
    ).toHaveLength(6);
    expect(
      draft.fields.filter((field) => field.id.startsWith("answer:")),
    ).toHaveLength(1);
    expect(JSON.stringify(draft)).not.toContain("candidate-documents/private");
  });

  it("rejects non-Greenhouse and unreviewed handoffs", () => {
    expect(() =>
      buildGreenhouseTransferDraft({
        packet: readyPacket(),
        destination: "https://example.com/jobs/42",
      }),
    ).toThrow("restricted to official Greenhouse");
    const packet = {
      ...readyPacket(),
      completeness: {
        ...readyPacket().completeness,
        readyForSubmissionHandoff: false,
      },
    };
    expect(() =>
      buildGreenhouseTransferDraft({
        packet,
        destination: "https://boards.greenhouse.io/acme/jobs/42",
      }),
    ).toThrow("complete the current packet");
  });
});
