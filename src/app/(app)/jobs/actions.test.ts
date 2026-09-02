import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateBetaAccessError } from "@/core/errors/application-errors";

const {
  analysisFindFirst,
  analysisUpsert,
  deleteMany,
  jobFindFirst,
  findUnique,
  redirect,
  refreshJobEvidence,
  refreshApplicationPacket,
  requireAuthenticatedActor,
  revalidatePath,
  startApplication,
  trackProductEvent,
  upsert,
  userFindUnique,
} = vi.hoisted(() => ({
  analysisFindFirst: vi.fn(),
  analysisUpsert: vi.fn(async () => undefined),
  deleteMany: vi.fn(async () => ({ count: 1 })),
  jobFindFirst: vi.fn(),
  findUnique: vi.fn(),
  redirect: vi.fn(),
  refreshJobEvidence: vi.fn(),
  refreshApplicationPacket: vi.fn(async () => undefined),
  requireAuthenticatedActor: vi.fn(async () => ({ id: "user-1" })),
  revalidatePath: vi.fn(),
  startApplication: vi.fn(),
  trackProductEvent: vi.fn(async () => undefined),
  upsert: vi.fn(async () => undefined),
  userFindUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor,
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/features/analytics/track-product-event", () => ({
  trackProductEvent,
}));
vi.mock("@/features/applications/start-application", () => ({
  startApplication,
}));
vi.mock("@/features/applications/refresh-application-packet", () => ({
  refreshApplicationPacket,
}));
vi.mock("@/features/jobs/refresh-job-evidence", () => ({
  refreshJobEvidence,
}));
vi.mock(
  "@/integrations/applications/prisma-application-packet-repository",
  () => ({ PrismaApplicationPacketRepository: class {} }),
);
vi.mock(
  "@/integrations/applications/prisma-application-start-repository",
  () => ({ PrismaApplicationStartRepository: class {} }),
);
vi.mock("@/integrations/analytics/prisma-product-analytics-provider", () => ({
  PrismaProductAnalyticsProvider: class {},
}));
vi.mock("@/integrations/jobs/prisma-job-ingestion-repository", () => ({
  PrismaJobIngestionRepository: class {},
}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    candidateJobDisposition: { deleteMany, upsert },
    job: { findFirst: jobFindFirst, findUnique },
    jobMatchAnalysis: {
      findFirst: analysisFindFirst,
      upsert: analysisUpsert,
    },
    user: { findUnique: userFindUnique },
  })),
}));

import {
  analyzeJobAction,
  setJobDispositionAction,
  startApplicationAction,
} from "./actions";

function dispositionForm(status: string) {
  const form = new FormData();
  form.set("jobId", "job-1");
  form.set("status", status);
  return form;
}

describe("candidate job disposition action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ applications: [], id: "job-1" });
    startApplication.mockResolvedValue({
      applicationId: "application-1",
      created: true,
      state: "PREPARING",
    });
    refreshJobEvidence.mockResolvedValue({
      canonicalJobId: "job-1",
      evidenceChanged: false,
    });
    analysisFindFirst.mockResolvedValue({ id: "analysis-current" });
  });

  it("refreshes authoritative job evidence before reusing a current analysis", async () => {
    const form = new FormData();
    form.set("jobId", "job-1");

    await analyzeJobAction(form);

    expect(refreshJobEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1" }),
    );
    expect(analysisFindFirst).toHaveBeenCalledWith({
      where: {
        jobId: "job-1",
        job: { evidenceVersion: "job-evidence-v2" },
        scoringVersion: "match-v1.2",
        userId: "user-1",
      },
      select: { id: true },
    });
    expect(jobFindFirst).not.toHaveBeenCalled();
    expect(analysisUpsert).not.toHaveBeenCalled();
  });

  it("recomputes match-v1.2 from refreshed current evidence without changing application state", async () => {
    refreshJobEvidence.mockResolvedValueOnce({
      canonicalJobId: "job-1",
      evidenceChanged: true,
    });
    analysisFindFirst.mockResolvedValueOnce(null);
    jobFindFirst.mockResolvedValueOnce({
      educationRequirements: null,
      employmentType: null,
      experienceRequirements: null,
      id: "job-1",
      locations: null,
      preferredRequirements: null,
      remoteType: null,
      requirements: [
        {
          kind: "SKILL",
          origin: "SOURCE_TEXT_EXPLICIT",
          skillName: "Python",
          sourceField: "description.requirements",
          statement: "Experience with Python",
        },
      ],
      salaryMax: null,
      seniority: null,
      skills: null,
      sponsorship: null,
      workAuthorization: null,
    });
    userFindUnique.mockResolvedValueOnce({
      candidateFacts: [],
      candidatePreferences: null,
      educationRecords: [],
      projects: [],
      skills: [],
      workAuthorizationProfile: null,
      workExperiences: [],
    });
    const form = new FormData();
    form.set("jobId", "job-1");

    await analyzeJobAction(form);

    expect(jobFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          evidenceVersion: "job-evidence-v2",
          id: "job-1",
        },
      }),
    );
    expect(analysisUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          evidenceCoverage: 0,
          overallFit: null,
          scoringVersion: "match-v1.2",
        }),
      }),
    );
    expect(startApplication).not.toHaveBeenCalled();
    expect(refreshApplicationPacket).not.toHaveBeenCalled();
  });

  it("opens the durable application returned by an idempotent start", async () => {
    const form = new FormData();
    form.set("jobId", "job-1");
    await startApplicationAction(form);
    expect(startApplication).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", userId: "user-1" }),
    );
    expect(redirect).toHaveBeenCalledWith("/applications/application-1");
    expect(refreshApplicationPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "application-1",
        userId: "user-1",
      }),
    );
  });

  it("persists an owner-scoped shortlist and refreshes relevant views", async () => {
    await setJobDispositionAction(dispositionForm("SHORTLISTED"));
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_jobId: { userId: "user-1", jobId: "job-1" } },
      create: { userId: "user-1", jobId: "job-1", status: "SHORTLISTED" },
      update: { status: "SHORTLISTED" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/jobs");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("persists transient shortlist feedback immediately without removing the card", async () => {
    const form = dispositionForm("SHORTLISTED");
    form.set("feedbackMode", "transient");
    await setJobDispositionAction(form);
    expect(upsert).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalledWith("/jobs");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("restores shortlisted or rejected work to undecided without deleting the job", async () => {
    await setJobDispositionAction(dispositionForm("UNDECIDED"));
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", jobId: "job-1" },
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "job-1", status: "ACTIVE" } }),
    );
  });

  it("does not conflate candidate rejection with an existing application", async () => {
    findUnique.mockResolvedValue({
      applications: [{ id: "application-1" }],
      id: "job-1",
    });
    await setJobDispositionAction(dispositionForm("REJECTED"));
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(trackProductEvent).not.toHaveBeenCalled();
  });

  it("denies a non-invited authenticated actor before a workspace mutation", async () => {
    requireAuthenticatedActor.mockRejectedValueOnce(
      new PrivateBetaAccessError(),
    );
    await expect(
      setJobDispositionAction(dispositionForm("SHORTLISTED")),
    ).rejects.toBeInstanceOf(PrivateBetaAccessError);
    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(trackProductEvent).not.toHaveBeenCalled();
  });
});
