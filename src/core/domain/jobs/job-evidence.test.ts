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

  it("derives work mode only from an explicit location token", () => {
    expect(explicitRemoteTypeFromLocation("Remote - Brazil")).toBe("REMOTE");
    expect(explicitRemoteTypeFromLocation("Hybrid — São Paulo")).toBe("HYBRID");
    expect(explicitRemoteTypeFromLocation("São Paulo")).toBeNull();
  });
});
