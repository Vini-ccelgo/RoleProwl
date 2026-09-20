import { describe, expect, it } from "vitest";
import type { PublicApplicationQuestion } from "./public-application-question";
import {
  adaptExperienceDurationToEmployerControl,
  adaptKnownValueToEmployerControl,
  normalizePersonalNameForEmployerPresentation,
} from "./control-adaptation";

function question(
  options: readonly { label: string; value: string }[],
): PublicApplicationQuestion {
  return {
    id: "question",
    source: "GREENHOUSE",
    group: "STANDARD",
    label: "Question",
    required: true,
    fieldNames: ["question"],
    fieldTypes: ["multi_value_single_select"],
    options: options.map((option) => option.label),
    optionIdentities: options,
  };
}

describe("employer control adaptation", () => {
  it("preserves a matching raw employer identity", () => {
    expect(
      adaptKnownValueToEmployerControl(
        "30 days",
        question([
          { label: "Immediately", value: "now-id" },
          { label: "30 days", value: "thirty-id" },
        ]),
      ),
    ).toBe("thirty-id");
  });

  it("selects the truthful range for a fractional duration", () => {
    expect(
      adaptExperienceDurationToEmployerControl(
        43,
        question([
          { label: "0 to 1 years", value: "0-1" },
          { label: "1 to 3 years", value: "1-3" },
          { label: "3 to 5 years", value: "3-5" },
          { label: "5 plus years", value: "5+" },
        ]),
      ),
    ).toBe("3-5");
  });

  it("uses completed years for exact-year options without rounding upward", () => {
    expect(
      adaptExperienceDurationToEmployerControl(
        43,
        question([
          { label: "3 years", value: "three" },
          { label: "4 years", value: "four" },
          { label: "5 plus years", value: "five-plus" },
        ]),
      ),
    ).toBe("three");
  });

  it("requires an explicit zero option instead of coercing zero into a range", () => {
    expect(
      adaptExperienceDurationToEmployerControl(
        0,
        question([
          { label: "0 to 1 years", value: "range-zero" },
          { label: "1 to 3 years", value: "range-one" },
        ]),
      ),
    ).toBeNull();
    expect(
      adaptExperienceDurationToEmployerControl(
        0,
        question([
          { label: "None", value: "none-raw" },
          { label: "1 to 3 years", value: "range-one" },
        ]),
      ),
    ).toBe("none-raw");
  });

  it("normalizes only obviously uppercase personal names for presentation", () => {
    expect(normalizePersonalNameForEmployerPresentation("  MAYA   CHEN ")).toBe(
      "Maya Chen",
    );
    expect(normalizePersonalNameForEmployerPresentation("MARY-JANE")).toBe(
      "Mary-Jane",
    );
    expect(normalizePersonalNameForEmployerPresentation("O'NEIL")).toBe(
      "O'Neil",
    );
    expect(normalizePersonalNameForEmployerPresentation("McDonald")).toBe(
      "McDonald",
    );
    expect(normalizePersonalNameForEmployerPresentation("李")).toBe("李");
    expect(normalizePersonalNameForEmployerPresentation("АННА")).toBe("АННА");
  });
});
