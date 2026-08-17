import { describe, expect, it } from "vitest";
import { discoverPersonalJobs } from "./personal-discovery";

describe("personal public-source adapters", () => {
  it("normalizes optional Adzuna and targeted Lever/Ashby responses", async () => {
    const result = await discoverPersonalJobs({
      adzunaCountry: "br",
      environment: {
        ADZUNA_APP_ID: "fixture-id",
        ADZUNA_APP_KEY: "fixture-key",
      },
      locations: ["Brazil"],
      queries: ["security"],
      targetedSources: [
        {
          kind: "LEVER",
          company: "Lever Corp",
          site: "lever",
          region: "GLOBAL",
        },
        { kind: "ASHBY", company: "Ashby Corp", boardName: "ashby" },
      ],
      request: async (input) => {
        const url = new URL(input);
        if (url.hostname === "jobicy.com") return Response.json({ jobs: [] });
        if (url.hostname === "remotive.com") return Response.json({ jobs: [] });
        if (url.hostname === "api.adzuna.com")
          return Response.json({
            results: [
              {
                id: "a1",
                title: "Security Analyst",
                company: { display_name: "Adzuna Corp" },
                redirect_url: "https://www.adzuna.com/details/a1",
                description: "Security monitoring",
                location: { display_name: "Brazil" },
                created: "2026-08-16T00:00:00.000Z",
              },
            ],
          });
        if (url.hostname === "api.lever.co")
          return Response.json([
            {
              id: "l1",
              text: "SOC Analyst",
              hostedUrl: "https://jobs.lever.co/lever/l1",
              applyUrl: "https://jobs.lever.co/lever/l1/apply",
              descriptionPlain: "Monitor SIEM alerts",
              workplaceType: "remote",
              categories: { location: "Remote", commitment: "Full-time" },
              createdAt: Date.parse("2026-08-16T00:00:00.000Z"),
            },
          ]);
        if (url.hostname === "api.ashbyhq.com")
          return Response.json({
            jobs: [
              {
                title: "Security Engineer",
                jobUrl: "https://jobs.ashbyhq.com/ashby/a2",
                applyUrl: "https://jobs.ashbyhq.com/ashby/a2/application",
                descriptionPlain: "Build security controls",
                location: "Remote",
                isRemote: true,
                isListed: true,
                employmentType: "FullTime",
                publishedAt: "2026-08-16T00:00:00.000Z",
              },
            ],
          });
        throw new Error(`Unexpected URL ${url}`);
      },
    });
    expect(result.jobs.map((job) => job.source)).toEqual([
      "ADZUNA",
      "LEVER",
      "ASHBY",
    ]);
    expect(result.jobs[1].canonical.canonicalApplicationUrl).toBe(
      "https://jobs.lever.co/lever/l1/apply",
    );
    expect(result.jobs[2].canonical.remoteType).toBe("REMOTE");
    expect(result.sources.every((source) => source.status === "OK")).toBe(true);
  });
});
