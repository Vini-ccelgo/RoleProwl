import { describe, expect, it } from "vitest";
import { candidateJurisdictionKnowledgeAnswers } from "./candidate-jurisdiction-knowledge";

describe("structured candidate jurisdiction knowledge", () => {
  it.each([
    ["BR", "WORK_AUTHORIZATION:BR", "SPONSORSHIP_REQUIREMENT:BR"],
    ["US", "WORK_AUTHORIZATION:US", "SPONSORSHIP_REQUIREMENT:US"],
  ] as const)(
    "creates independent authorization and sponsorship concepts for %s",
    (countryCode, authorization, sponsorship) => {
      expect(
        candidateJurisdictionKnowledgeAnswers({
          countryCode,
          authorized: true,
          sponsorshipRequired: false,
        }),
      ).toEqual([
        { concept: authorization, answer: { status: "Authorized" } },
        { concept: sponsorship, answer: { required: false } },
      ]);
    },
  );
});
