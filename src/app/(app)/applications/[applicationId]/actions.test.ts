import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApplicationPacket } from "@/core/domain/applications/application-packet";

const {
  confirmExternalSubmission,
  findFirst,
  refreshApplicationPacket,
  saveApplicationOverrides,
} = vi.hoisted(() => ({
  confirmExternalSubmission: vi.fn(async () => undefined),
  findFirst: vi.fn(),
  refreshApplicationPacket: vi.fn(async () => undefined),
  saveApplicationOverrides: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({ application: { findFirst } })),
}));
vi.mock("@/features/applications/refresh-application-packet", () => ({
  refreshApplicationPacket,
}));
vi.mock("@/features/applications/save-application-overrides", () => ({
  saveApplicationOverrides,
}));
vi.mock("@/features/applications/prepare-and-submit-application", () => ({
  confirmExternalSubmission,
}));
vi.mock(
  "@/integrations/applications/prisma-application-packet-repository",
  () => ({ PrismaApplicationPacketRepository: class {} }),
);
vi.mock(
  "@/integrations/applications/prisma-application-override-repository",
  () => ({ PrismaApplicationOverrideRepository: class {} }),
);
vi.mock(
  "@/integrations/applications/prisma-application-submission-repository",
  () => ({ PrismaApplicationSubmissionRepository: class {} }),
);
vi.mock(
  "@/integrations/applications/prisma-application-tracker-repository",
  () => ({ PrismaApplicationTrackerRepository: class {} }),
);
vi.mock("@/integrations/analytics/prisma-product-analytics-provider", () => ({
  PrismaProductAnalyticsProvider: class {},
}));

import {
  confirmExternalApplicationAction,
  markApplicationReadyAction,
  saveApplicationOverridesAction,
} from "./actions";

function form() {
  const value = new FormData();
  value.set("applicationId", "application-1");
  return value;
}

const readyPacket = buildApplicationPacket({
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
    targetRole: "Security Analyst",
  },
});

describe("application packet actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rebuilds from current owner data before marking ready", async () => {
    findFirst.mockResolvedValue({
      jobId: "job-1",
      state: "NEEDS_REVIEW",
      submissionDestination: "https://job-boards.greenhouse.io/acme/jobs/42",
      job: { reviewQueueItems: [] },
    });
    await markApplicationReadyAction(form());
    expect(refreshApplicationPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "application-1",
        reviewed: true,
        userId: "user-1",
      }),
    );
  });

  it("blocks external confirmation when READY lacks a reviewed coherent packet", async () => {
    findFirst.mockResolvedValue({
      id: "application-1",
      userId: "user-1",
      state: "READY",
      submissionDestination: "https://job-boards.greenhouse.io/acme/jobs/42",
      submissionMechanism: "EXTERNAL_APPLICATION",
      submissionPayloadSnapshot: {},
    });
    await expect(confirmExternalApplicationAction(form())).rejects.toThrow(
      "Refresh and review",
    );
    expect(confirmExternalSubmission).not.toHaveBeenCalled();
  });

  it("retains explicit candidate confirmation for a reviewed packet", async () => {
    findFirst.mockResolvedValue({
      id: "application-1",
      userId: "user-1",
      state: "READY",
      submissionDestination: "https://job-boards.greenhouse.io/acme/jobs/42",
      submissionMechanism: "EXTERNAL_APPLICATION",
      submissionPayloadSnapshot: { packet: readyPacket },
    });
    const value = form();
    value.set("confirmed", "yes");
    await confirmExternalApplicationAction(value);
    expect(confirmExternalSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed: true, userId: "user-1" }),
    );
  });

  it("saves only typed application-specific fields for the owner", async () => {
    const value = form();
    value.set("identity:phone", "+55 51 5555 0100");
    value.set("answer:question-42", "Yes");
    value.set("identity:unsupported", "ignored");
    await saveApplicationOverridesAction(value);
    expect(saveApplicationOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "application-1",
        userId: "user-1",
        identity: [{ key: "phone", value: "+55 51 5555 0100" }],
        answers: [{ key: "question-42", value: "Yes" }],
      }),
    );
  });
});
