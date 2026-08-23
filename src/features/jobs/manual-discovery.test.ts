import { describe, expect, it, vi } from "vitest";
import type { JobSourceAdapter } from "@/core/contracts/job-source-adapter";
import type { SourceCapability } from "@/core/types/capabilities";
import {
  parseGreenhouseBoards,
  runManualDiscovery,
  searchRunIsActive,
} from "./manual-discovery";

function adapter(): JobSourceAdapter {
  const source = {
    source: "GREENHOUSE",
    externalId: "job-1",
    sourceUrl: "https://example.test/job-1",
    applicationUrl: "https://example.test/job-1",
    payload: {},
  };
  return {
    source: "GREENHOUSE",
    getCapabilities: () => new Set<SourceCapability>(["READ_JOBS"]),
    discover: async () => ({ jobs: [source], nextCursor: null }),
    fetch: async () => source,
    refresh: async () => source,
    normalize: async () => ({
      source,
      canonical: {
        company: "Synthetic Co",
        title: "Synthetic Analyst",
        description: null,
        canonicalApplicationUrl: source.applicationUrl,
        locations: null,
        remoteType: null,
        employmentType: null,
        seniority: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryInterval: null,
        requirements: null,
        preferredRequirements: null,
        skills: null,
        educationRequirements: null,
        experienceRequirements: null,
        workAuthorization: null,
        sponsorship: null,
        postedAt: null,
        expiresAt: null,
      },
    }),
  };
}

describe("manual public job discovery", () => {
  it("parses only explicit Greenhouse board configuration", () => {
    expect(
      parseGreenhouseBoards(
        JSON.stringify([
          { boardToken: "synthetic_board", company: "Synthetic Co" },
        ]),
      ),
    ).toEqual([{ boardToken: "synthetic_board", company: "Synthetic Co" }]);
    expect(parseGreenhouseBoards(undefined)).toEqual([]);
    expect(() =>
      parseGreenhouseBoards('[{"boardToken":"bad token","company":"X"}]'),
    ).toThrow();
  });

  it("treats only a recent running state as an active duplicate", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    expect(
      searchRunIsActive(
        { status: "RUNNING", startedAt: new Date("2026-08-22T11:59:00Z") },
        now,
      ),
    ).toBe(true);
    expect(
      searchRunIsActive(
        { status: "RUNNING", startedAt: new Date("2026-08-22T11:30:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("reuses discovery and canonical ingestion and reports real counts", async () => {
    const createCanonicalWithSource = vi.fn(async () => "canonical-1");
    const result = await runManualDiscovery({
      adapters: [adapter()],
      health: { report: async () => undefined },
      repository: {
        findDeduplicationCandidates: async () => [],
        createCanonicalWithSource,
        mergeSourceAssociation: async () => undefined,
      },
    });
    expect(createCanonicalWithSource).toHaveBeenCalledOnce();
    expect(result).toEqual({
      discoveredCount: 1,
      newCount: 1,
      sourceFailureCount: 0,
    });
  });
});
