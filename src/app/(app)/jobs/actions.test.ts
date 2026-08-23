import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteMany,
  findUnique,
  redirect,
  refreshApplicationPacket,
  requireAuthenticatedActor,
  revalidatePath,
  startApplication,
  trackProductEvent,
  upsert,
} = vi.hoisted(() => ({
  deleteMany: vi.fn(async () => ({ count: 1 })),
  findUnique: vi.fn(),
  redirect: vi.fn(),
  refreshApplicationPacket: vi.fn(async () => undefined),
  requireAuthenticatedActor: vi.fn(async () => ({ id: "user-1" })),
  revalidatePath: vi.fn(),
  startApplication: vi.fn(),
  trackProductEvent: vi.fn(async () => undefined),
  upsert: vi.fn(async () => undefined),
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
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    candidateJobDisposition: { deleteMany, upsert },
    job: { findUnique },
  })),
}));

import { setJobDispositionAction, startApplicationAction } from "./actions";

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
});
