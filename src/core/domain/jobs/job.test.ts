import { describe, expect, it } from "vitest";
import { canonicalJobContentHash, canonicalJobSchema } from "./job";

const sparseJob = {
  company: "Acme",
  title: "Product Manager",
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

describe("canonical jobs", () => {
  it("preserves source unknowns as null rather than invented false or empty values", () => {
    expect(canonicalJobSchema.parse(sparseJob)).toEqual(sparseJob);
  });

  it("hashes meaningful content changes but ignores display whitespace and case identity", () => {
    const base = canonicalJobContentHash(sparseJob);
    expect(
      canonicalJobContentHash({
        ...sparseJob,
        company: " ACME ",
        title: "product manager",
      }),
    ).toBe(base);
    expect(
      canonicalJobContentHash({ ...sparseJob, description: "Changed role" }),
    ).not.toBe(base);
  });

  it("rejects contradictory salary ranges at the domain edge", () => {
    expect(() =>
      canonicalJobSchema.parse({
        ...sparseJob,
        salaryMin: 120000,
        salaryMax: 90000,
      }),
    ).toThrow("Maximum salary");
  });
});
