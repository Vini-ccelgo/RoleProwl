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
