import { describe, expect, it } from "vitest";
import {
  educationSchema,
  normalizeSkillAliases,
  normalizeSkillName,
  splitList,
  workAuthorizationSchema,
  workExperienceSchema,
} from "./truth-vault";

describe("candidate Truth Vault invariants", () => {
  it("validates employment dates and current employment explicitly", () => {
    const base = {
      id: "",
      employer: "Acme",
      title: "Engineer",
      employmentType: "Full-time",
      startDate: "2024-01-01",
      location: "Remote",
      description: "",
      responsibilities: [],
      achievements: [],
    };
    expect(
      workExperienceSchema.safeParse({ ...base, isCurrent: true, endDate: "" })
        .success,
    ).toBe(true);
    expect(
      workExperienceSchema.safeParse({
        ...base,
        isCurrent: true,
        endDate: "2025-01-01",
      }).success,
    ).toBe(false);
    expect(
      workExperienceSchema.safeParse({
        ...base,
        isCurrent: false,
        endDate: "2023-01-01",
      }).success,
    ).toBe(false);
  });

  it("validates education date order", () => {
    expect(
      educationSchema.safeParse({
        id: "",
        institution: "Example University",
        program: "Computing",
        credential: "BSc",
        startDate: "2024-01-01",
        endDate: "2023-01-01",
        status: "Completed",
        coursework: [],
      }).success,
    ).toBe(false);
  });

  it("normalizes duplicate skills and aliases without conflating technical names", () => {
    expect(normalizeSkillName("  JavaScript ")).toBe("javascript");
    expect(normalizeSkillName("C++")).not.toBe(normalizeSkillName("C"));
    expect(
      normalizeSkillAliases(["JS", " js ", "JavaScript"], "JavaScript"),
    ).toEqual(["JS"]);
    expect(splitList("React, React\nTypeScript")).toEqual([
      "React",
      "TypeScript",
    ]);
  });

  it("requires authorization and sponsorship to be explicit", () => {
    expect(
      workAuthorizationSchema.safeParse({
        countryCode: "us",
        authorizationStatus: "Citizen",
        requiresSponsorship: false,
        notes: "",
      }).success,
    ).toBe(true);
    expect(
      workAuthorizationSchema.safeParse({
        countryCode: "US",
        authorizationStatus: "Citizen",
      }).success,
    ).toBe(false);
  });
});
