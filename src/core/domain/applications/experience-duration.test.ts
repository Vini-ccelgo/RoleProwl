import { describe, expect, it } from "vitest";
import {
  completedExperienceYears,
  formattedExperienceDuration,
  unionExperienceDurationMonths,
} from "./experience-duration";

describe("experience duration", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("unions overlapping month intervals instead of double-counting them", () => {
    expect(
      unionExperienceDurationMonths({
        now,
        experiences: [
          {
            id: "job-a",
            startDate: "2023-01-01T00:00:00.000Z",
            endDate: "2025-01-01T00:00:00.000Z",
          },
          {
            id: "job-b",
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2025-01-01T00:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({ months: 24, includedIds: ["job-a", "job-b"] });
  });

  it("uses the supplied evaluation month for current roles", () => {
    expect(
      unionExperienceDurationMonths({
        now,
        experiences: [
          {
            id: "current",
            startDate: "2025-01-01T00:00:00.000Z",
            isCurrent: true,
          },
        ],
      }).months,
    ).toBe(20);
  });

  it("excludes missing, inverted, and future intervals without inflating duration", () => {
    expect(
      unionExperienceDurationMonths({
        now,
        experiences: [
          { id: "missing", startDate: "2024-01-01T00:00:00.000Z" },
          {
            id: "future",
            startDate: "2027-01-01T00:00:00.000Z",
            isCurrent: true,
          },
          {
            id: "valid",
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2025-01-01T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      months: 12,
      includedIds: ["valid"],
      invalidIds: ["missing", "future"],
    });
  });

  it("deduplicates records and reports conservative completed years", () => {
    const result = unionExperienceDurationMonths({
      now,
      selectedIds: ["job-a"],
      experiences: [
        {
          id: "job-a",
          startDate: "2023-01-01T00:00:00.000Z",
          endDate: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "job-a",
          startDate: "2023-01-01T00:00:00.000Z",
          endDate: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    expect(result.months).toBe(43);
    expect(completedExperienceYears(result.months)).toBe(3);
    expect(formattedExperienceDuration(result.months)).toBe("3.6 years");
  });
});
