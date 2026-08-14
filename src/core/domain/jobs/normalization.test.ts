import { describe, expect, it } from "vitest";
import {
  canonicalizeApplicationUrl,
  normalizeCanonicalJob,
  normalizeJobSkills,
} from "./normalization";

describe("job normalization", () => {
  it("normalizes URLs, locations, types, currency, and skills", () => {
    expect(
      canonicalizeApplicationUrl(
        "https://EXAMPLE.test/jobs/1/?utm_source=x&ref=feed#apply",
      ),
    ).toBe("https://example.test/jobs/1");
    expect(
      normalizeJobSkills([" Java ", "java", "JavaScript", "C", "C++"]),
    ).toEqual(["Java", "JavaScript", "C", "C++"]);
    expect(
      normalizeCanonicalJob({
        company: "  Acme  Inc. ",
        title: " Product   Manager ",
        description: "Build  things\r\nWell",
        canonicalApplicationUrl: "https://example.test/jobs/1?utm_medium=email",
        locations: [" New York ", "new york"],
        remoteType: null,
        employmentType: "Fulltime",
        seniority: null,
        salaryMin: 100,
        salaryMax: 120,
        salaryCurrency: "usd",
        salaryInterval: "YEAR",
        requirements: null,
        preferredRequirements: null,
        skills: ["SQL", "PostgreSQL"],
        educationRequirements: null,
        experienceRequirements: null,
        workAuthorization: null,
        sponsorship: null,
        postedAt: null,
        expiresAt: null,
      }),
    ).toEqual(
      expect.objectContaining({
        company: "Acme Inc.",
        title: "Product Manager",
        locations: ["new york"],
        employmentType: "FULL_TIME",
        salaryCurrency: "USD",
        skills: ["SQL", "PostgreSQL"],
      }),
    );
  });

  it("refuses unsafe application destinations during normalization", () => {
    expect(() => canonicalizeApplicationUrl("javascript:alert(1)")).toThrow(
      "HTTPS",
    );
    expect(() =>
      canonicalizeApplicationUrl("https://user:secret@example.test/apply"),
    ).toThrow("credentials");
  });
});
