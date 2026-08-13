import { describe, expect, it } from "vitest";
import type {
  JobSourceAdapter,
  SourceHealthEvent,
} from "@/core/contracts/job-source-adapter";
import { SourceAdapterError } from "@/core/errors/source-adapter-error";
import type { SourceCapability } from "@/core/types/capabilities";
import { discoverAcrossSources } from "./discover-across-sources";

const canonical = {
  company: "Acme",
  title: "Engineer",
  description: null,
  canonicalApplicationUrl: null,
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
};

function adapter(source: string, fails = false): JobSourceAdapter {
  const raw = {
    source,
    externalId: "1",
    sourceUrl: null,
    applicationUrl: null,
    payload: {},
  };
  return {
    source,
    getCapabilities: () => new Set<SourceCapability>(["READ_JOBS"]),
    discover: async () => {
      if (fails)
        throw new SourceAdapterError(
          source,
          "RATE_LIMITED",
          `${source} rate limit reached`,
        );
      return { jobs: [raw], nextCursor: null };
    },
    fetch: async () => raw,
    refresh: async () => raw,
    normalize: async (sourceJob) => ({ source: sourceJob, canonical }),
  };
}

describe("multi-source discovery", () => {
  it("returns healthy-source jobs when another adapter fails", async () => {
    const events: SourceHealthEvent[] = [];
    const result = await discoverAcrossSources(
      [adapter("healthy"), adapter("broken", true)],
      { query: "engineer" },
      { report: async (event) => void events.push(event) },
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.failures).toEqual([
      {
        source: "broken",
        code: "RATE_LIMITED",
        message: "broken rate limit reached",
      },
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "healthy", status: "HEALTHY" }),
        expect.objectContaining({ source: "broken", status: "DEGRADED" }),
      ]),
    );
  });

  it("skips adapters that do not advertise job reading", async () => {
    const unsupported = {
      ...adapter("unsupported"),
      getCapabilities: () => new Set<SourceCapability>(),
    };
    const result = await discoverAcrossSources(
      [unsupported],
      { query: "x" },
      { report: async () => undefined },
    );
    expect(result).toEqual({ jobs: [], failures: [] });
  });
});
