import { describe, expect, it } from "vitest";
import {
  explicitRemoteTypeFromLocation,
  extractExplicitJobCriteria,
} from "./job-evidence";

describe("grounded job evidence extraction", () => {
  it("extracts only bullets under explicit requirement headings", () => {
    expect(
      extractExplicitJobCriteria(
        "About us\nWe love Python.\nRequirements\n• 5+ years of Python required.\n• A relevant degree\nResponsibilities\n• Build systems",
      ),
    ).toEqual({
      required: [
        {
          kind: "SKILL",
          statement: "5+ years of Python required.",
          origin: "SOURCE_TEXT_EXPLICIT",
          sourceField: "description.requirements",
          skillName: "Python",
          minimumExperienceMonths: 60,
        },
        {
          kind: "OTHER",
          statement: "A relevant degree",
          origin: "SOURCE_TEXT_EXPLICIT",
          sourceField: "description.requirements",
        },
      ],
      preferred: null,
    });
  });

  it("does not promote narrative keyword mentions into requirements", () => {
    expect(
      extractExplicitJobCriteria(
        "We use Python and value five years of experience. Build systems with us.",
      ),
    ).toEqual({ required: null, preferred: null });
  });

  it("recognizes explicit heading variants, safe bullet forms, and paragraph criteria", () => {
    expect(
      extractExplicitJobCriteria(
        [
          "What You’ll Need",
          "- 3+ years of Python",
          "▪ Experience with network automation",
          "Bachelor’s degree or equivalent experience",
          "Preferred Skills",
          "* Knowledge of Terraform",
          "Responsibilities",
          "- Operate production services",
        ].join("\n"),
      ),
    ).toEqual({
      required: [
        expect.objectContaining({
          kind: "SKILL",
          minimumExperienceMonths: 36,
          skillName: "Python",
        }),
        expect.objectContaining({
          kind: "SKILL",
          skillName: "network automation",
        }),
        expect.objectContaining({
          kind: "OTHER",
          statement: "Bachelor’s degree or equivalent experience",
        }),
      ],
      preferred: [
        expect.objectContaining({
          kind: "SKILL",
          skillName: "Terraform",
        }),
      ],
    });
  });

  it("does not carry requirements across a non-qualification section", () => {
    expect(
      extractExplicitJobCriteria(
        "Requirements\n• Python required\nOur Culture\n• Be curious\n• Be kind",
      ),
    ).toEqual({
      required: [expect.objectContaining({ statement: "Python required" })],
      preferred: null,
    });
  });

  it("keeps general duration evidence as experience rather than inventing a skill", () => {
    expect(
      extractExplicitJobCriteria(
        "Minimum Qualifications\n- 4+ years of relevant professional experience",
      ).required,
    ).toEqual([
      expect.objectContaining({
        kind: "EXPERIENCE",
        minimumExperienceMonths: 48,
      }),
    ]);
  });

  it("derives work mode only from an explicit location token", () => {
    expect(explicitRemoteTypeFromLocation("Remote - Brazil")).toBe("REMOTE");
    expect(explicitRemoteTypeFromLocation("Hybrid — São Paulo")).toBe("HYBRID");
    expect(explicitRemoteTypeFromLocation("São Paulo")).toBeNull();
  });
});
