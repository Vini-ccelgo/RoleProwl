import { describe, expect, it } from "vitest";
import {
  claimCanPassReadiness,
  classifyGeneratedClaim,
  classifyGeneratedClaimDetailed,
  type ClaimEvidenceInput,
} from "./provenance";

const work: ClaimEvidenceInput = {
  evidenceType: "WORK_EXPERIENCE",
  evidenceId: "work-1",
  evidenceField: "record",
  snapshot: {
    employer: "Acme Market",
    title: "Inventory Lead",
    startDate: "2024-01-01T00:00:00.000Z",
    endDate: "2025-01-01T00:00:00.000Z",
    responsibilities: ["Led stock control and marketplace management"],
    achievements: ["Reduced stock errors by 18%"],
  },
};

const classify = (
  assertions: Parameters<typeof classifyGeneratedClaim>[0]["assertions"],
  evidence = [work],
  intendedClassification:
    | "DIRECT_FACT"
    | "SUPPORTED_REWRITE"
    | "SUPPORTED_INFERENCE" = "SUPPORTED_REWRITE",
) => classifyGeneratedClaim({ assertions, evidence, intendedClassification });

describe("generated claim provenance", () => {
  it.each([
    {
      name: "no linked evidence",
      assertions: [],
      evidence: [],
      intendedClassification: "DIRECT_FACT",
      expected: {
        classification: "UNSUPPORTED",
        failureReason: "NO_LINKED_EVIDENCE",
      },
    },
    {
      name: "unsupported assertion",
      assertions: [{ kind: "CREDENTIAL_NAME", value: "PMP" }],
      evidence: [work],
      intendedClassification: "SUPPORTED_REWRITE",
      expected: {
        classification: "UNSUPPORTED",
        failureReason: "ASSERTION_NOT_SUPPORTED",
      },
    },
    {
      name: "under-supported inference",
      assertions: [],
      evidence: [work],
      intendedClassification: "SUPPORTED_INFERENCE",
      expected: {
        classification: "UNSUPPORTED",
        failureReason: "INFERENCE_INSUFFICIENT_EVIDENCE",
      },
    },
    {
      name: "valid direct fact",
      assertions: [],
      evidence: [work],
      intendedClassification: "DIRECT_FACT",
      expected: { classification: "DIRECT_FACT", failureReason: null },
    },
    {
      name: "valid supported rewrite",
      assertions: [{ kind: "EMPLOYER_NAME", value: "Acme Market" }],
      evidence: [work],
      intendedClassification: "SUPPORTED_REWRITE",
      expected: { classification: "SUPPORTED_REWRITE", failureReason: null },
    },
    {
      name: "valid supported inference",
      assertions: [],
      evidence: [work, { ...work, evidenceId: "work-2" }],
      intendedClassification: "SUPPORTED_INFERENCE",
      expected: {
        classification: "SUPPORTED_INFERENCE",
        failureReason: null,
      },
    },
  ] as const)(
    "details $name without changing the compatibility classification",
    ({ assertions, evidence, intendedClassification, expected }) => {
      const input = { assertions, evidence, intendedClassification };

      expect(classifyGeneratedClaimDetailed(input)).toEqual(expected);
      expect(classifyGeneratedClaim(input)).toBe(expected.classification);
    },
  );

  it.each([
    ["invented certification", [{ kind: "CREDENTIAL_NAME", value: "PMP" }]],
    ["changed employer", [{ kind: "EMPLOYER_NAME", value: "Globex" }]],
    ["exaggerated duration", [{ kind: "DURATION_MONTHS", value: "36" }]],
    ["unsupported number", [{ kind: "NUMERIC_ACHIEVEMENT", value: "40%" }]],
  ] as const)("classifies %s as unsupported", (_name, assertions) => {
    expect(classify(assertions)).toBe("UNSUPPORTED");
  });

  it("rejects an unsupported management claim", () => {
    expect(
      classify(
        [{ kind: "MANAGEMENT_SCOPE", value: "managed a team" }],
        [
          {
            ...work,
            snapshot: {
              title: "Associate",
              responsibilities: ["Counted stock"],
            },
          },
        ],
      ),
    ).toBe("UNSUPPORTED");
  });

  it("accepts a valid paraphrase with linked factual atoms", () => {
    expect(
      classify([
        { kind: "EMPLOYER_NAME", value: "Acme Market" },
        { kind: "NUMERIC_ACHIEVEMENT", value: "18%" },
      ]),
    ).toBe("SUPPORTED_REWRITE");
  });

  it.each([
    ["employer", { kind: "EMPLOYER_NAME", value: "Acme Market" }],
    ["duration", { kind: "DURATION_MONTHS", value: "12" }],
    ["management scope", { kind: "MANAGEMENT_SCOPE", value: "team lead" }],
    ["numeric achievement", { kind: "NUMERIC_ACHIEVEMENT", value: "18%" }],
  ] as const)("accepts supported %s assertions", (_name, assertion) => {
    expect(classify([assertion])).toBe("SUPPORTED_REWRITE");
  });

  it("accepts an exact credential and rejects a changed credential", () => {
    const credential: ClaimEvidenceInput = {
      evidenceType: "CREDENTIAL",
      evidenceId: "credential-1",
      evidenceField: "record",
      snapshot: { credential: "AWS Certified Security - Specialty" },
    };

    expect(
      classify(
        [
          {
            kind: "CREDENTIAL_NAME",
            value: "AWS Certified Security - Specialty",
          },
        ],
        [credential],
      ),
    ).toBe("SUPPORTED_REWRITE");
    expect(
      classify(
        [{ kind: "CREDENTIAL_NAME", value: "AWS Solutions Architect" }],
        [credential],
      ),
    ).toBe("UNSUPPORTED");
  });

  it("requires multiple evidence nodes for supported synthesis", () => {
    const second = { ...work, evidenceId: "work-2" };
    expect(classify([], [work, second], "SUPPORTED_INFERENCE")).toBe(
      "SUPPORTED_INFERENCE",
    );
    expect(classify([], [work], "SUPPORTED_INFERENCE")).toBe("UNSUPPORTED");
  });

  it("never lets unsupported or unlinked claims pass readiness", () => {
    expect(claimCanPassReadiness("UNSUPPORTED", 2)).toBe(false);
    expect(claimCanPassReadiness("DIRECT_FACT", 0)).toBe(false);
    expect(claimCanPassReadiness("SUPPORTED_REWRITE", 1)).toBe(true);
  });
});
