import { describe, expect, it, vi } from "vitest";
import type { JobSourceAdapter } from "@/core/contracts/job-source-adapter";
import type { SourceCapability } from "@/core/types/capabilities";
import {
  directedJobSearchCriteria,
  isGreenhouseConfigurationFailure,
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
  it("requires a non-empty role family and keeps location optional", () => {
    expect(directedJobSearchCriteria(null)).toBeNull();
    expect(
      directedJobSearchCriteria({
        roleFamilies: ["  ", "Platform Engineering "],
        locationPreferences: [],
      }),
    ).toEqual({ query: "Platform Engineering" });
    expect(
      directedJobSearchCriteria({
        roleFamilies: ["Operations"],
        locationPreferences: [" ", "Remote "],
      }),
    ).toEqual({ query: "Operations", location: "Remote" });
  });

  it("parses only explicit Greenhouse board configuration", () => {
    expect(
      parseGreenhouseBoards(
        JSON.stringify([
          { boardToken: "synthetic_board", company: "Synthetic Co" },
        ]),
      ),
    ).toEqual([{ boardToken: "synthetic_board", company: "Synthetic Co" }]);
    expect(parseGreenhouseBoards(undefined)).toEqual([]);
    let malformed: unknown;
    try {
      parseGreenhouseBoards('[{"boardToken":"bad token","company":"X"}]');
    } catch (error) {
      malformed = error;
    }
    expect(malformed).toBeDefined();
    expect(isGreenhouseConfigurationFailure(malformed)).toBe(true);
    expect(
      isGreenhouseConfigurationFailure(new SyntaxError("invalid JSON")),
    ).toBe(true);
    expect(
      isGreenhouseConfigurationFailure(new Error("source unavailable")),
    ).toBe(false);
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
      query: { query: "Synthetic Analyst" },
    });
    expect(createCanonicalWithSource).toHaveBeenCalledOnce();
    expect(result).toEqual({
      discoveredCount: 1,
      newCount: 1,
      sourceFailureCount: 0,
      discoveryDurationMs: expect.any(Number),
      ingestionDurationMs: expect.any(Number),
    });
  });

  it("fails safely when every configured source is unavailable and can retry", async () => {
    let fail = true;
    const retryable = adapter();
    retryable.discover = async () => {
      if (fail) throw new Error("temporary source failure");
      return adapter().discover({ query: "" });
    };
    const input = {
      adapters: [retryable],
      health: { report: async () => undefined },
      repository: {
        findDeduplicationCandidates: async () => [],
        createCanonicalWithSource: async () => "canonical-1",
        mergeSourceAssociation: async () => undefined,
      },
      query: { query: "Synthetic Analyst" },
    };

    await expect(runManualDiscovery(input)).rejects.toThrow(
      "All configured public job sources were unavailable.",
    );
    fail = false;
    await expect(runManualDiscovery(input)).resolves.toMatchObject({
      discoveredCount: 1,
      newCount: 1,
      sourceFailureCount: 0,
    });
  });

  it("rejects an empty query before calling a public source", async () => {
    const source = adapter();
    source.discover = vi.fn(source.discover);
    await expect(
      runManualDiscovery({
        adapters: [source],
        health: { report: async () => undefined },
        repository: {
          findDeduplicationCandidates: async () => [],
          createCanonicalWithSource: async () => "canonical-1",
          mergeSourceAssociation: async () => undefined,
        },
        query: { query: "  " },
      }),
    ).rejects.toThrow("requires a role-family query");
    expect(source.discover).not.toHaveBeenCalled();
  });
});
