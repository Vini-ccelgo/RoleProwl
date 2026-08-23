import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApplicationPacket } from "@/core/domain/applications/application-packet";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(async () => ({ count: 1 })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    application: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
    },
  })),
}));

import { PrismaApplicationOverrideRepository } from "./prisma-application-override-repository";

function packet() {
  return buildApplicationPacket({
    reviewed: true,
    source: {
      accountEmail: "account@example.test",
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
      selectedResume: {
        fileName: "resume.pdf",
        contentType: "application/pdf",
        storageKey: "candidate-documents/safe",
        tailored: false,
      },
      coverLetter: null,
      questions: [],
      questionInspection: "AVAILABLE",
      sourceName: "GREENHOUSE",
      targetRole: "Analyst",
    },
  });
}

describe("Prisma application override repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      id: "application-1",
      state: "READY",
      updatedAt: new Date("2026-08-23T12:00:00Z"),
      submissionPayloadSnapshot: { packet: packet(), overrides: {} },
    });
  });

  it("stores owner-scoped overrides and refreshes an unreviewed packet", async () => {
    const refresh = vi.fn(async () => packet());
    await new PrismaApplicationOverrideRepository({ refresh }).save({
      applicationId: "application-1",
      userId: "user-1",
      identity: [{ key: "phone", value: "+55 51 5555 0100" }],
      answers: [],
    });
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "application-1",
          userId: "user-1",
          submittedAt: null,
        }),
      }),
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          submissionPayloadSnapshot: expect.objectContaining({
            overrides: {
              identity: { phone: "+55 51 5555 0100" },
              answers: {},
            },
          }),
        },
      }),
    );
    expect(refresh).toHaveBeenCalledWith({
      applicationId: "application-1",
      userId: "user-1",
      reviewed: false,
    });
  });

  it("conceals another candidate's or submitted application", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(
      new PrismaApplicationOverrideRepository({ refresh: vi.fn() }).save({
        applicationId: "foreign",
        userId: "user-1",
        identity: [],
        answers: [],
      }),
    ).rejects.toThrow("Application not found");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not mutate or rebuild when submitted values are unchanged", async () => {
    const currentPacket = packet();
    mocks.findFirst.mockResolvedValue({
      id: "application-1",
      state: "READY",
      updatedAt: new Date("2026-08-23T12:00:00Z"),
      submissionPayloadSnapshot: {
        packet: currentPacket,
        overrides: { identity: { phone: "+55 51 5555 0100" }, answers: {} },
      },
    });
    const refresh = vi.fn(async () => currentPacket);
    const result = await new PrismaApplicationOverrideRepository({
      refresh,
    }).save({
      applicationId: "application-1",
      userId: "user-1",
      identity: [{ key: "phone", value: "+55 51 5555 0100" }],
      answers: [],
    });
    expect(result).toBe(currentPacket);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
