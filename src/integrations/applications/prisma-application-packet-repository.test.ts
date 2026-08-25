import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApplicationPacket } from "@/core/domain/applications/application-packet";

const mocks = vi.hoisted(() => ({
  applicationFindFirst: vi.fn(),
  applicationUpdateMany: vi.fn(async () => ({ count: 1 })),
  applicationEventCreate: vi.fn(async () => undefined),
  auditCreate: vi.fn(async () => undefined),
  userFindUnique: vi.fn(),
  profileFindUnique: vi.fn(),
  factsFindMany: vi.fn(),
  experienceFindMany: vi.fn(),
  educationFindMany: vi.fn(),
  credentialFindMany: vi.fn(),
  skillFindMany: vi.fn(),
  authorizationFindUnique: vi.fn(),
  preferencesFindUnique: vi.fn(),
  answerFindMany: vi.fn(),
  resumeFindFirst: vi.fn(),
  documentFindFirst: vi.fn(),
  writingFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    application: { findFirst: mocks.applicationFindFirst },
    user: { findUnique: mocks.userFindUnique },
    candidateProfile: { findUnique: mocks.profileFindUnique },
    candidateFact: { findMany: mocks.factsFindMany },
    workExperience: { findMany: mocks.experienceFindMany },
    education: { findMany: mocks.educationFindMany },
    credential: { findMany: mocks.credentialFindMany },
    skill: { findMany: mocks.skillFindMany },
    workAuthorizationProfile: { findUnique: mocks.authorizationFindUnique },
    candidatePreferences: { findUnique: mocks.preferencesFindUnique },
    answerMemory: { findMany: mocks.answerFindMany },
    resumeVersion: { findFirst: mocks.resumeFindFirst },
    candidateDocument: { findFirst: mocks.documentFindFirst },
    applicationWritingArtifact: { findMany: mocks.writingFindMany },
    $transaction: vi.fn(async (callback) =>
      callback({
        application: { updateMany: mocks.applicationUpdateMany },
        applicationEvent: { create: mocks.applicationEventCreate },
        auditEvent: { create: mocks.auditCreate },
      }),
    ),
  })),
}));

import { PrismaApplicationPacketRepository } from "./prisma-application-packet-repository";

const application = {
  id: "application-1",
  userId: "user-1",
  jobId: "job-1",
  state: "NEEDS_REVIEW",
  submittedAt: null,
  submissionDestination: "https://job-boards.greenhouse.io/acme/jobs/42",
  submissionPayloadSnapshot: {
    reference: { source: "GREENHOUSE", externalId: "42" },
  },
  job: {
    title: "Security Analyst",
    sourceRecords: [
      {
        source: "GREENHOUSE",
        externalId: "42",
        applicationUrl: "https://job-boards.greenhouse.io/acme/jobs/42",
      },
    ],
  },
};

describe("Prisma application packet repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applicationFindFirst.mockResolvedValue(application);
    mocks.userFindUnique.mockResolvedValue({ email: "signin@example.test" });
    mocks.profileFindUnique.mockResolvedValue({
      firstName: "Avery",
      lastName: "Quill",
      applicationEmail: "apply@example.test",
      phone: "+1 555 0100",
      location: "Boston, MA",
      countryCode: "US",
      professionalTitle: "Security Analyst",
    });
    mocks.factsFindMany.mockResolvedValue([
      { factType: "SKILL_TEXT", value: { text: "Incident response" } },
    ]);
    mocks.experienceFindMany.mockResolvedValue([]);
    mocks.educationFindMany.mockResolvedValue([]);
    mocks.credentialFindMany.mockResolvedValue([]);
    mocks.skillFindMany.mockResolvedValue([]);
    mocks.authorizationFindUnique.mockResolvedValue(null);
    mocks.preferencesFindUnique.mockResolvedValue(null);
    mocks.answerFindMany.mockResolvedValue([]);
    mocks.resumeFindFirst.mockResolvedValue(null);
    mocks.documentFindFirst.mockResolvedValue({
      originalFileName: "resume.pdf",
      mimeType: "application/pdf",
      storageKey: "candidate-documents/safe",
    });
    mocks.writingFindMany.mockResolvedValue([]);
  });

  it("builds and approves a complete owner-scoped packet", async () => {
    const request = vi.fn(async () =>
      Response.json({
        questions: [
          {
            required: true,
            label: "First Name",
            fields: [{ name: "first_name", type: "input_text" }],
          },
          {
            required: true,
            label: "Résumé/CV",
            fields: [{ name: "resume", type: "input_file" }],
          },
        ],
      }),
    );
    const packet = await new PrismaApplicationPacketRepository(request).refresh(
      {
        applicationId: "application-1",
        userId: "user-1",
        reviewed: true,
      },
    );
    expect(packet.completeness.readyForSubmissionHandoff).toBe(true);
    expect(packet.professional.skills).toContain("Incident response");
    expect(mocks.applicationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "application-1", userId: "user-1" },
      }),
    );
    expect(mocks.applicationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "READY",
          documentsSnapshot: [
            {
              kind: "RESUME",
              fileName: "resume.pdf",
              contentType: "application/pdf",
              storageKey: "candidate-documents/safe",
            },
          ],
        }),
      }),
    );
  });

  it("selects the job-tailored résumé but keeps it unresolved before candidate review", async () => {
    mocks.resumeFindFirst.mockResolvedValue({
      id: "resume-version-1",
      renderedFileName: "avery-security-analyst.docx",
      renderedContentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      renderedStorageKey: "resume-versions/tailored-safe",
    });
    const packet = await new PrismaApplicationPacketRepository(
      vi.fn(async () => Response.json({ questions: [] })),
    ).refresh({
      applicationId: "application-1",
      userId: "user-1",
      reviewed: false,
    });
    expect(packet.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "RESUME",
          fileName: "avery-security-analyst.docx",
          status: "UNRESOLVED",
          provenance: [expect.objectContaining({ source: "TAILORED_RESUME" })],
        }),
      ]),
    );
    expect(packet.completeness.readyForSubmissionHandoff).toBe(false);
    expect(mocks.applicationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resumeVersionId: "resume-version-1",
          state: "NEEDS_REVIEW",
          documentsSnapshot: [
            {
              kind: "RESUME",
              fileName: "avery-security-analyst.docx",
              contentType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              storageKey: "resume-versions/tailored-safe",
            },
          ],
        }),
      }),
    );
  });

  it("synchronizes a changed pre-submission CandidateDocument selection", async () => {
    mocks.documentFindFirst.mockResolvedValue({
      originalFileName: "resume-b.pdf",
      mimeType: "application/pdf",
      storageKey: "candidate-documents/resume-b",
    });
    await new PrismaApplicationPacketRepository(
      vi.fn(async () => Response.json({ questions: [] })),
    ).refresh({
      applicationId: "application-1",
      userId: "user-1",
      reviewed: false,
    });
    expect(mocks.applicationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentsSnapshot: [
            {
              kind: "RESUME",
              fileName: "resume-b.pdf",
              contentType: "application/pdf",
              storageKey: "candidate-documents/resume-b",
            },
          ],
        }),
      }),
    );
  });

  it("stores no résumé snapshot when the packet has no selected résumé", async () => {
    mocks.documentFindFirst.mockResolvedValue(null);
    await new PrismaApplicationPacketRepository(
      vi.fn(async () => Response.json({ questions: [] })),
    ).refresh({
      applicationId: "application-1",
      userId: "user-1",
      reviewed: false,
    });
    expect(mocks.applicationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentsSnapshot: [],
          resumeVersionId: null,
        }),
      }),
    );
  });

  it("applies an Application override and invalidates prior READY review", async () => {
    mocks.applicationFindFirst.mockResolvedValue({
      ...application,
      state: "READY",
      submissionPayloadSnapshot: {
        overrides: {
          identity: { phone: "+55 51 5555 0100" },
          answers: {},
        },
      },
    });
    mocks.profileFindUnique.mockResolvedValue({
      firstName: "Avery",
      lastName: "Quill",
      applicationEmail: "apply@example.test",
      phone: null,
      location: "Porto Alegre",
      countryCode: "BR",
      professionalTitle: "Security Analyst",
    });
    const packet = await new PrismaApplicationPacketRepository(
      vi.fn(async () =>
        Response.json({
          questions: [
            {
              required: true,
              label: "Phone",
              fields: [{ name: "phone", type: "input_text" }],
            },
          ],
        }),
      ),
    ).refresh({
      applicationId: "application-1",
      userId: "user-1",
      reviewed: false,
    });
    expect(
      packet.identity.find((field) => field.key === "phone"),
    ).toMatchObject({
      status: "RESOLVED",
      value: "+55 51 5555 0100",
      provenance: [expect.objectContaining({ source: "APPLICATION_OVERRIDE" })],
    });
    expect(packet.reviewedAt).toBeNull();
    expect(mocks.applicationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "NEEDS_REVIEW" }),
      }),
    );
  });

  it("returns a submitted historical packet without rebuilding it", async () => {
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
        selectedResume: null,
        coverLetter: null,
        questions: [],
        questionInspection: "UNAVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Security Analyst",
      },
    });
    mocks.applicationFindFirst.mockResolvedValue({
      ...application,
      state: "SUBMITTED",
      submittedAt: new Date(),
      documentsSnapshot: [
        {
          kind: "RESUME",
          fileName: "resume-a.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/resume-a",
        },
      ],
      submissionPayloadSnapshot: { packet },
    });
    mocks.documentFindFirst.mockResolvedValue({
      originalFileName: "resume-b.pdf",
      mimeType: "application/pdf",
      storageKey: "candidate-documents/resume-b",
    });
    const result = await new PrismaApplicationPacketRepository().refresh({
      applicationId: "application-1",
      userId: "user-1",
      reviewed: false,
    });
    expect(result).toEqual(packet);
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
    expect(mocks.applicationUpdateMany).not.toHaveBeenCalled();
  });

  it("reconciles a stored answer when refreshed question metadata changes its id", async () => {
    const previousPacket = buildApplicationPacket({
      reviewed: false,
      source: {
        accountEmail: null,
        profile: null,
        applicationOverrides: {
          identity: {},
          answers: { "standard:1": "Kubernetes, AWS, Docker" },
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
        questionInspection: "AVAILABLE",
        sourceName: "GREENHOUSE",
        targetRole: "Security Analyst",
      },
    });
    mocks.applicationFindFirst.mockResolvedValue({
      ...application,
      submissionPayloadSnapshot: {
        packet: previousPacket,
        overrides: {
          identity: {},
          answers: { "standard:1": "Kubernetes, AWS, Docker" },
        },
      },
    });
    const packet = await new PrismaApplicationPacketRepository(
      vi.fn(async () =>
        Response.json({
          questions: [
            {
              required: true,
              label: "Which technologies have you used professionally?",
              fields: [
                {
                  name: "question_42",
                  type: "multi_value_single_select",
                  values: [{ label: "Option A" }, { label: "Option B" }],
                },
              ],
            },
          ],
        }),
      ),
    ).refresh({
      applicationId: "application-1",
      userId: "user-1",
      reviewed: false,
    });
    expect(packet.answers[0]).toMatchObject({
      questionId: "standard:question_42",
      status: "CONFLICTING",
      value: "Kubernetes, AWS, Docker",
      options: ["Option A", "Option B"],
    });
    expect(mocks.applicationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submissionPayloadSnapshot: expect.objectContaining({
            overrides: {
              identity: {},
              answers: {
                "standard:question_42": "Kubernetes, AWS, Docker",
              },
            },
          }),
        }),
      }),
    );
  });

  it("conceals another candidate's application", async () => {
    mocks.applicationFindFirst.mockResolvedValue(null);
    await expect(
      new PrismaApplicationPacketRepository().refresh({
        applicationId: "foreign",
        userId: "user-1",
        reviewed: false,
      }),
    ).rejects.toThrow("Application not found");
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
  });
});
