import { describe, expect, it } from "vitest";
import {
  defaultPersonalPreferences,
  parsePersonalResume,
  parsePersonalSources,
  renderPersonalResultsMarkdown,
  runPersonalProwl,
} from "./personal-prowl";

const resume = `
AVERY QUILL — FICTIONAL

Summary
Security analyst focused on defensive operations.

Skills: SIEM, Splunk, Incident Response, Python, SQL, Linux, Network Security

Experience
Security Operations Analyst — Fictional Systems

Education
Fictional Technical College

Languages: English, Portuguese
Location: São Paulo, Brazil
Work Authorization
Authorized to work in Brazil. No sponsorship required.
`;

const securityDescription =
  "Required skills: SIEM, Splunk, Python, incident response, and network security.";

function request(input: string) {
  const url = new URL(input);
  if (url.hostname === "jobicy.com")
    return Promise.resolve(
      Response.json({
        jobs: [
          {
            id: 101,
            jobTitle: "Security Analyst",
            companyName: "Example Corp",
            url: "https://jobicy.com/jobs/example/security-analyst",
            jobDescription: securityDescription,
            jobGeo: "Remote",
            jobType: "full-time",
            pubDate: "2026-08-15T12:00:00.000Z",
          },
        ],
      }),
    );
  if (url.hostname === "remotive.com")
    return Promise.resolve(
      Response.json({
        jobs: [
          {
            id: 202,
            title: "Security Analyst",
            company_name: "Example Corp",
            url: "https://remotive.com/remote-jobs/software-dev/security-analyst-202",
            description: securityDescription,
            candidate_required_location: "Remote",
            job_type: "full_time",
            publication_date: "2026-08-15T12:00:00.000Z",
          },
        ],
      }),
    );
  if (url.hostname === "boards-api.greenhouse.io")
    return Promise.resolve(
      Response.json({
        jobs: [
          {
            id: 303,
            title: "Senior Marketing Director",
            content: "Required: marketing and sales. This role is onsite.",
            absolute_url: "https://job-boards.greenhouse.io/example/jobs/303",
            location: { name: "Boston, MA" },
            updated_at: "2026-08-16T12:00:00.000Z",
          },
        ],
      }),
    );
  throw new Error(`Unexpected test URL: ${url}`);
}

describe("RoleProwl personal mode", () => {
  it("parses legacy and explicit targeted board formats", () => {
    expect(
      parsePersonalSources(`
        Example Corp|example
        greenhouse|Duplicate|https://job-boards.greenhouse.io/example
        lever|Lever Corp|https://jobs.lever.co/lever-site
        lever-eu|EU Corp|eu-site
        ashby|Ashby Corp|https://jobs.ashbyhq.com/ashby-board
      `),
    ).toEqual([
      { kind: "GREENHOUSE", company: "Example Corp", boardToken: "example" },
      {
        kind: "LEVER",
        company: "Lever Corp",
        site: "lever-site",
        region: "GLOBAL",
      },
      { kind: "LEVER", company: "EU Corp", site: "eu-site", region: "EU" },
      { kind: "ASHBY", company: "Ashby Corp", boardName: "ashby-board" },
    ]);
  });

  it("rejects arbitrary hosts instead of becoming a crawler", () => {
    expect(() =>
      parsePersonalSources(
        "greenhouse|Example|https://jobs.example.com/careers",
      ),
    ).toThrow(/unsupported Greenhouse host/u);
  });

  it("extracts conventional resume sections without inventing proficiency", () => {
    const parsed = parsePersonalResume(resume);
    expect(parsed.skills).toEqual(expect.arrayContaining(["SIEM", "Linux"]));
    expect(parsed.languages).toEqual(["English", "Portuguese"]);
    expect(parsed.location).toBe("São Paulo, Brazil");
    expect(parsed.authorizationCountries).toEqual(["BR"]);
    expect(parsed.requiresSponsorship).toBe(false);
  });

  it("discovers multiple sources, deduplicates, hard-filters, ranks, and renders", async () => {
    const result = await runPersonalProwl({
      resume,
      preferences: {
        ...defaultPersonalPreferences,
        targetRoles: ["Security Analyst", "SOC Analyst"],
        searchTerms: ["cybersecurity"],
        locations: ["Remote", "Brazil"],
        remotePreferred: true,
        excludedSeniorities: ["SENIOR"],
      },
      sources: [
        { kind: "GREENHOUSE", company: "Example Corp", boardToken: "example" },
      ],
      limit: 25,
      now: new Date("2026-08-17T12:00:00.000Z"),
      request,
    });

    expect(result.sources.map((source) => source.status)).toEqual([
      "OK",
      "OK",
      "SKIPPED",
      "OK",
    ]);
    expect(result.stats.jobsDiscovered).toBe(3);
    expect(result.stats.jobsDeduplicated).toBe(2);
    expect(result.stats.jobsFiltered).toBe(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        title: "Security Analyst",
        company: "Example Corp",
        remoteStatus: "REMOTE",
        freshness: "CURRENT",
      }),
    );
    expect(result.jobs[0].sources.map((source) => source.source)).toEqual([
      "JOBICY",
      "REMOTIVE",
    ]);
    expect(result.jobs[0].strongMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Required skill: SIEM" }),
        expect.objectContaining({ label: "Target-role alignment" }),
      ]),
    );
    const markdown = renderPersonalResultsMarkdown(result);
    expect(markdown).toContain("## Discovery sources");
    expect(markdown).toContain("**Job ID:**");
    expect(markdown).toContain("### Strong matches");
    expect(markdown).toContain("### Unknowns");
    expect(JSON.stringify(result)).not.toContain("AVERY QUILL");
  });

  it("isolates a source failure when another source returns usable jobs", async () => {
    const result = await runPersonalProwl({
      resume,
      preferences: {
        ...defaultPersonalPreferences,
        targetRoles: ["Security Analyst"],
      },
      request: async (input) => {
        if (new URL(input).hostname === "jobicy.com")
          return new Response("unavailable", { status: 503 });
        return request(input);
      },
      now: new Date("2026-08-17T12:00:00.000Z"),
    });
    expect(result.sourceErrors).toEqual([expect.stringMatching(/^Jobicy:/u)]);
    expect(result.jobs).toHaveLength(1);
  });

  it("filters reliably stale jobs", async () => {
    const result = await runPersonalProwl({
      resume,
      preferences: { ...defaultPersonalPreferences, maximumJobAgeDays: 30 },
      request: async (input) => {
        const url = new URL(input);
        if (url.hostname === "jobicy.com")
          return Response.json({
            jobs: [
              {
                id: 1,
                jobTitle: "Security Analyst",
                companyName: "Old Corp",
                url: "https://jobicy.com/jobs/old/1",
                pubDate: "2026-01-01T00:00:00.000Z",
              },
            ],
          });
        return Response.json({ jobs: [] });
      },
      now: new Date("2026-08-17T12:00:00.000Z"),
    });
    expect(result.jobs).toHaveLength(0);
    expect(result.filteredJobs[0].reasons[0]).toMatch(/days old/u);
  });

  it("fails clearly for an empty resume and invalid limits", async () => {
    await expect(runPersonalProwl({ resume: " " })).rejects.toThrow(
      /resume\.txt is empty/u,
    );
    await expect(runPersonalProwl({ resume, limit: 0 })).rejects.toThrow(
      /--limit/u,
    );
  });
});
