import { describe, expect, it } from "vitest";
import {
  applicationTransferStatus,
  buildApplicationPacket,
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
    questionInspection: "UNAVAILABLE",
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
});
