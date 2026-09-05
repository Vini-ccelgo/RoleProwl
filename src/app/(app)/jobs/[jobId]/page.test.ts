import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, findFirst, notFound, requireWorkspacePageActor } =
  vi.hoisted(() => ({
    connection: vi.fn(async () => undefined),
    findFirst: vi.fn(),
    notFound: vi.fn(),
    requireWorkspacePageActor: vi.fn(async () => ({ id: "candidate-1" })),
  }));

vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/features/accounts/require-workspace-page-actor", () => ({
  requireWorkspacePageActor,
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({ job: { findFirst } })),
}));
vi.mock("@/app/(app)/jobs/actions", () => ({
  analyzeJobAction: vi.fn(),
  setJobDispositionAction: vi.fn(),
  startApplicationAction: vi.fn(),
}));

import JobDetailPage from "./page";

const analysis = {
  confidence: 0,
  conflicts: [],
  evidenceCoverage: 0,
  gaps: [],
  hardConflicts: [],
  id: "analysis-1",
  overallFit: null,
  partialMatches: [],
  preferenceScore: null,
  qualificationScore: null,
  scoringVersion: "match-v1.2",
  strengths: [],
  unknowns: [],
};

function persistedJob(input: {
  readonly evidenceVersion: string | null;
  readonly scoringVersion: string | null;
}) {
  return {
    applications: [],
    candidateDispositions: [],
    canonicalApplicationUrl: "https://boards.greenhouse.io/acme/jobs/101",
    company: "Acme",
    description: "Requirements\n• Experience with Python",
    educationRequirements: null,
    employmentType: null,
    evidenceVersion: input.evidenceVersion,
    experienceRequirements: null,
    expiresAt: null,
    firstSeenAt: new Date("2026-08-26T21:16:03.987Z"),
    id: "job-101",
    lastSeenAt: new Date("2026-08-26T21:16:03.987Z"),
    lastVerifiedAt: new Date("2026-08-26T21:16:03.987Z"),
    locations: null,
    matchAnalyses: input.scoringVersion
      ? [{ ...analysis, scoringVersion: input.scoringVersion }]
      : [],
    normalizedCompany: "acme",
    normalizedTitle: "engineer",
    postedAt: null,
    preferredRequirements: null,
    remoteType: null,
    requirements: null,
    salaryCurrency: null,
    salaryInterval: null,
    salaryMax: null,
    salaryMin: null,
    seniority: null,
    skills: null,
    sourceRecords: [
      {
        applicationUrl: "https://boards.greenhouse.io/acme/jobs/101",
        lastVerifiedAt: new Date("2026-08-26T21:16:03.987Z"),
        source: "GREENHOUSE",
        sourceUrl: "https://boards.greenhouse.io/acme/jobs/101",
      },
    ],
    sponsorship: null,
    status: "ACTIVE",
    title: "Senior Software Engineer — Python exp is a must",
    updatedAt: new Date("2026-08-26T21:16:04.359Z"),
    workAuthorization: null,
  };
}

async function renderDetail(input: {
  readonly evidenceVersion: string | null;
  readonly scoringVersion: string | null;
}) {
  findFirst.mockImplementationOnce(async (query) => {
    const persisted = persistedJob(input);
    const analysisWhere = query.include.matchAnalyses.where;
    const current =
      input.evidenceVersion === analysisWhere.job.evidenceVersion &&
      input.scoringVersion === analysisWhere.scoringVersion;
    return {
      ...persisted,
      matchAnalyses: current ? persisted.matchAnalyses : [],
    };
  });
  return renderToStaticMarkup(
    await JobDetailPage({ params: Promise.resolve({ jobId: "job-101" }) }),
  );
}

describe("job detail current-analysis action boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [null, "match-v1.2", "NULL evidence version"],
    ["job-evidence-v1", "match-v1.2", "obsolete evidence version"],
    ["job-evidence-v2", "match-v1.2", "obsolete evidence version"],
    ["job-evidence-v3", "match-v1.1", "obsolete scoring version"],
    ["job-evidence-v3", null, "missing analysis"],
  ])(
    "offers Analyze fit for %s / %s (%s)",
    async (evidenceVersion, scoringVersion, label) => {
      const markup = await renderDetail({ evidenceVersion, scoringVersion });

      expect(markup, label).toContain("Analyze fit");
      expect(markup).not.toContain("Review fit");
      expect(markup).not.toContain("Assessment confidence");
    },
  );

  it("offers Review fit only when both evidence and scoring versions are current", async () => {
    const markup = await renderDetail({
      evidenceVersion: "job-evidence-v3",
      scoringVersion: "match-v1.2",
    });

    expect(markup).toContain("Review fit");
    expect(markup).not.toContain("Analyze fit");
    expect(markup).toContain("0% assessment confidence");
  });

  it("passes the currentness filter through the real detail query", async () => {
    await renderDetail({ evidenceVersion: null, scoringVersion: "match-v1.2" });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          matchAnalyses: {
            where: {
              job: { evidenceVersion: "job-evidence-v3" },
              scoringVersion: "match-v1.2",
              userId: "candidate-1",
            },
            take: 1,
          },
        }),
      }),
    );
  });
});
