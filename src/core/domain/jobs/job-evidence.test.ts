import { describe, expect, it } from "vitest";
import {
  JOB_EVIDENCE_VERSION,
  explicitRemoteTypeFromLocation,
  extractExplicitJobCriteria,
} from "./job-evidence";

const REALISTIC_COMPOUND_REQUIREMENTS = [
  "Minimum of 8 years of software engineering experience with a Bachelor's degree in Computer Science, Engineering, or a related field; alternatively, 6+ years with a Master's degree, 3+ years with a PhD, or equivalent professional experience.",
  "Strong Python development experience, including multithreaded programming and performance optimization.",
  "Working proficiency in C and C++, with the ability to read, debug, build, and modify compiled analysis components.",
  "Experience deploying and maintaining machine learning inference solutions in production using frameworks such as PyTorch, LightGBM, scikit-learn, or ONNX.",
  "Familiarity with KVM/libvirt or similar virtualization technologies and a working knowledge of Windows internals, with the ability to develop deeper expertise.",
  "Experience with malware analysis, sandbox technologies, threat detection platforms, or cybersecurity software.",
] as const;

describe("grounded job evidence extraction", () => {
  it("identifies the compound normalization semantics explicitly", () => {
    expect(JOB_EVIDENCE_VERSION).toBe("job-evidence-v3");
  });

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

  it("preserves compound source statements while extracting only safely atomic evidence", () => {
    const required = extractExplicitJobCriteria(
      [
        "Requirements",
        ...REALISTIC_COMPOUND_REQUIREMENTS.map((item) => `• ${item}`),
      ].join("\n"),
    ).required!;
    const criteriaFor = (statement: string) =>
      required.filter((criterion) => criterion.statement === statement);

    expect(criteriaFor(REALISTIC_COMPOUND_REQUIREMENTS[0])).toEqual([
      expect.objectContaining({
        kind: "OTHER",
        logicalContext: "ALTERNATIVE",
      }),
    ]);
    expect(
      criteriaFor(REALISTIC_COMPOUND_REQUIREMENTS[0])[0],
    ).not.toHaveProperty("skillName");

    expect(criteriaFor(REALISTIC_COMPOUND_REQUIREMENTS[1])).toEqual([
      expect.objectContaining({
        kind: "SKILL",
        skillName: "Python",
      }),
      expect.objectContaining({
        kind: "OTHER",
        logicalContext: "AND",
      }),
    ]);

    expect(
      criteriaFor(REALISTIC_COMPOUND_REQUIREMENTS[2])
        .filter((criterion) => criterion.kind === "SKILL")
        .map((criterion) => criterion.skillName),
    ).toEqual(["C", "C++"]);
    expect(criteriaFor(REALISTIC_COMPOUND_REQUIREMENTS[2])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "OTHER", logicalContext: "AND" }),
      ]),
    );

    expect(
      criteriaFor(REALISTIC_COMPOUND_REQUIREMENTS[3])
        .filter((criterion) => criterion.kind === "SKILL")
        .map((criterion) => ({
          evaluationMode: criterion.evaluationMode,
          logicalContext: criterion.logicalContext,
          skillName: criterion.skillName,
        })),
    ).toEqual([
      {
        evaluationMode: "CONTEXT_ONLY",
        logicalContext: "EXAMPLE",
        skillName: "PyTorch",
      },
      {
        evaluationMode: "CONTEXT_ONLY",
        logicalContext: "EXAMPLE",
        skillName: "LightGBM",
      },
      {
        evaluationMode: "CONTEXT_ONLY",
        logicalContext: "EXAMPLE",
        skillName: "scikit-learn",
      },
      {
        evaluationMode: "CONTEXT_ONLY",
        logicalContext: "EXAMPLE",
        skillName: "ONNX",
      },
    ]);

    expect(criteriaFor(REALISTIC_COMPOUND_REQUIREMENTS[4])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evaluationMode: "CONTEXT_ONLY",
          kind: "SKILL",
          logicalContext: "OR",
          skillName: "KVM",
        }),
        expect.objectContaining({
          evaluationMode: "CONTEXT_ONLY",
          kind: "SKILL",
          logicalContext: "OR",
          skillName: "libvirt",
        }),
        expect.objectContaining({
          kind: "SKILL",
          logicalContext: "AND",
          skillName: "Windows internals",
        }),
        expect.objectContaining({ kind: "OTHER", logicalContext: "OR" }),
      ]),
    );
    expect(criteriaFor(REALISTIC_COMPOUND_REQUIREMENTS[5])).toEqual([
      expect.objectContaining({ kind: "OTHER", logicalContext: "OR" }),
    ]);

    for (const statement of REALISTIC_COMPOUND_REQUIREMENTS) {
      expect(criteriaFor(statement).length).toBeGreaterThan(0);
      expect(
        criteriaFor(statement).every(
          (criterion) =>
            criterion.origin === "SOURCE_TEXT_EXPLICIT" &&
            criterion.sourceField === "description.requirements",
        ),
      ).toBe(true);
    }
  });

  it("derives work mode only from an explicit location token", () => {
    expect(explicitRemoteTypeFromLocation("Remote - Brazil")).toBe("REMOTE");
    expect(explicitRemoteTypeFromLocation("Hybrid — São Paulo")).toBe("HYBRID");
    expect(explicitRemoteTypeFromLocation("São Paulo")).toBeNull();
  });
});
