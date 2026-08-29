import { describe, expect, it } from "vitest";
import { GreenhouseJobSource } from "./greenhouse-job-source";

const fixture = {
  jobs: [
    {
      id: 42,
      title: "Product Manager",
      content: "<p>Build &amp; improve products</p>",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/42",
      updated_at: "2026-08-01T12:00:00Z",
      location: { name: "Remote - US" },
      departments: [{ id: 1, name: "Product" }],
    },
  ],
};

describe("Greenhouse job source", () => {
  it("discovers and normalizes public published jobs without inventing unknowns", async () => {
    const source = new GreenhouseJobSource(
      { boardToken: "acme", company: "Acme Inc." },
      async () => Response.json(fixture),
    );
    const page = await source.discover({
      query: "product",
      location: "remote",
    });
    expect(page.jobs).toHaveLength(1);
    const normalized = await source.normalize(page.jobs[0]);
    expect(normalized.canonical).toEqual(
      expect.objectContaining({
        company: "Acme Inc.",
        title: "Product Manager",
        description: "Build & improve products",
        locations: ["Remote - US"],
        salaryMin: null,
        sponsorship: null,
      }),
    );
    expect(source.getCapabilities()).toEqual(
      new Set([
        "READ_JOBS",
        "READ_APPLICATION_SCHEMA",
        "REQUIRES_USER_INTERACTION",
        "REQUIRES_PARTNER_AUTH",
      ]),
    );
  });

  it("filters query and location deterministically", async () => {
    const source = new GreenhouseJobSource(
      { boardToken: "acme", company: "Acme" },
      async () => Response.json(fixture),
    );
    expect((await source.discover({ query: "engineer" })).jobs).toHaveLength(0);
    expect(
      (await source.discover({ query: "product", location: "London" })).jobs,
    ).toHaveLength(0);
  });

  it("converts rate limits and invalid payloads into typed source failures", async () => {
    const limited = new GreenhouseJobSource(
      { boardToken: "acme", company: "Acme" },
      async () => new Response(null, { status: 429 }),
    );
    await expect(limited.discover({ query: "" })).rejects.toMatchObject({
      sourceCode: "RATE_LIMITED",
    });

    const invalid = new GreenhouseJobSource(
      { boardToken: "acme", company: "Acme" },
      async () => Response.json({ unexpected: true }),
    );
    await expect(invalid.discover({ query: "" })).rejects.toMatchObject({
      sourceCode: "INVALID_RESPONSE",
    });
  });

  it("bounds aborts and ordinary HTTP failures as safe source errors", async () => {
    const timedOut = new GreenhouseJobSource(
      { boardToken: "acme", company: "Acme" },
      async (_input, init) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(init?.redirect).toBe("error");
        const error = new Error("request aborted");
        error.name = "AbortError";
        throw error;
      },
    );
    await expect(timedOut.discover({ query: "" })).rejects.toMatchObject({
      sourceCode: "TIMEOUT",
      message: "Greenhouse job data is temporarily unavailable.",
    });

    const unavailable = new GreenhouseJobSource(
      { boardToken: "acme", company: "Acme" },
      async () => new Response(null, { status: 503 }),
    );
    await expect(unavailable.discover({ query: "" })).rejects.toMatchObject({
      sourceCode: "HTTP_503",
    });
  });
});
