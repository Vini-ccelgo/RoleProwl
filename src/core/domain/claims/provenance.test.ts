import { describe, expect, it } from "vitest";
import {
  claimCanPassReadiness,
  classifyGeneratedClaim,
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
