import { describe, expect, it } from "vitest";
import { parsePersonalResume } from "./personal-prowl";
import { buildCanonicalPersonalCandidate } from "./personal-candidate";

describe("personal candidate conversion", () => {
  it("creates canonical evidence and a shared matching snapshot without infrastructure", () => {
    const parsedResume = parsePersonalResume(
      "Skills: Linux, SIEM\nLanguages: Portuguese, English\nLocation: Brazil\nWork authorization: Authorized to work in Brazil; no sponsorship required",
    );
    const candidate = buildCanonicalPersonalCandidate({
      parsedResume,
      preferences: {
        locations: ["Brazil"],
        remotePreferred: true,
        targetRoles: ["Security Analyst"],
        minimumSalary: null,
      },
    });

    expect(candidate.version).toBe(1);
    expect(candidate.matchSnapshot.authorizationCountries).toEqual(["BR"]);
    expect(candidate.matchSnapshot.preferredRemoteTypes).toEqual(["REMOTE"]);
    expect(candidate.matchSnapshot.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Linux" }),
        expect.objectContaining({ name: "SIEM" }),
      ]),
    );
    expect(candidate.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "WORK_AUTHORIZATION",
          quote: "Authorized to work in Brazil; no sponsorship required",
        }),
      ]),
    );
  });
});
