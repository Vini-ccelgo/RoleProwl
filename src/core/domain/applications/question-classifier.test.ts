import { describe, expect, it } from "vitest";
import { classifyQuestionDeterministically } from "./question-classifier";

describe("application question deterministic classifier", () => {
  const examples = [
    [
      "Are you authorized to work in the United States?",
      "LEGAL_OR_CONSEQUENTIAL",
    ],
    [
      "Will you now or in the future require visa sponsorship?",
      "LEGAL_OR_CONSEQUENTIAL",
    ],
    ["Why are you interested in this role?", "JOB_SPECIFIC_FREE_TEXT"],
    ["Do you have a disability?", "SENSITIVE_PERSONAL_DATA"],
    ["What is your race or ethnicity?", "SENSITIVE_PERSONAL_DATA"],
    ["I certify all statements are accurate.", "ATTESTATION"],
    ["What are your desired salary expectations?", "USER_POLICY"],
    ["Are you willing to relocate?", "USER_POLICY"],
    ["How many years of experience do you have?", "COMPUTABLE_FACT"],
    ["What is your current employer?", "PROFILE_FACT"],
    ["Favorite style of architecture?", "UNKNOWN"],
  ] as const;

  it.each(examples)("classifies %s", (question, expected) => {
    expect(classifyQuestionDeterministically(question)).toMatchObject({
      classification: expected,
      source: "DETERMINISTIC",
    });
  });

  it("gives attestation language priority over incidental ordinary words", () => {
    expect(
      classifyQuestionDeterministically(
        "I certify my full name and all statements are accurate.",
      ).classification,
    ).toBe("ATTESTATION");
  });
});
