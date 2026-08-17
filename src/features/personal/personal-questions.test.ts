import { describe, expect, it, vi } from "vitest";
import { buildCanonicalPersonalCandidate } from "./personal-candidate";
import { parsePersonalResume } from "./personal-prowl";
import {
  parseGreenhouseApplicationQuestions,
  retrieveAndPrepareApplicationQuestions,
} from "./personal-questions";
import { personalJobFixture } from "./personal-test-fixture";
import type { PersonalStateJob } from "./personal-state";

function stateJob(): PersonalStateJob {
  const snapshot = personalJobFixture({
    sources: [
      {
        source: "GREENHOUSE",
        label: "Greenhouse/Example Corp",
        sourceJobId: "101",
        sourceUrl: "https://boards.greenhouse.io/example/jobs/101",
        questionReference: {
          source: "GREENHOUSE",
          boardToken: "example",
          jobId: "101",
        },
      },
    ],
  });
  return {
    id: snapshot.id,
    firstSeenAt: "2026-08-17T00:00:00.000Z",
    lastSeenAt: "2026-08-17T00:00:00.000Z",
    status: "SHORTLISTED",
    fitHistory: [],
    notes: [],
    appliedAt: null,
    applicationPackagePath: null,
    snapshot,
  };
}

const payload = {
  questions: [
    {
      required: true,
      label: "Current location",
      fields: [{ name: "location", type: "input_text", values: [] }],
    },
    {
      required: true,
      label: "Are you legally authorized to work in Brazil?",
      fields: [
        {
          name: "authorization",
          type: "multi_value_single_select",
          values: [
            { value: 1, label: "Yes" },
            { value: 0, label: "No" },
          ],
        },
      ],
    },
    {
      required: true,
      label: "I certify that my answers are accurate",
      fields: [{ name: "certify", type: "input_text", values: [] }],
    },
  ],
  compliance: [
    {
      questions: [
        {
          required: false,
          label: "Disability status",
          fields: [{ name: "disability", type: "input_text", values: [] }],
        },
      ],
    },
  ],
};

describe("public application questions", () => {
  it("parses documented Greenhouse question groups and options", () => {
    const questions = parseGreenhouseApplicationQuestions(payload);
    expect(questions).toHaveLength(4);
    expect(questions[1]?.options).toEqual(["Yes", "No"]);
    expect(questions[3]?.group).toBe("COMPLIANCE");
  });

  it("classifies questions while keeping sensitive and consequential answers under user control", async () => {
    const parsedResume = parsePersonalResume(
      "Location: Brazil\nWork authorization: Authorized to work in Brazil; no sponsorship required",
    );
    const candidate = buildCanonicalPersonalCandidate({
      parsedResume,
      preferences: {
        locations: [],
        remotePreferred: false,
        targetRoles: [],
        minimumSalary: null,
      },
    });
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const questions = await retrieveAndPrepareApplicationQuestions({
      candidate,
      job: stateJob(),
      request,
    });

    expect(request).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/example/jobs/101?questions=true",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
    expect(questions.map((question) => question.classification)).toEqual([
      "PROFILE_FACT",
      "LEGAL_OR_CONSEQUENTIAL",
      "ATTESTATION",
      "SENSITIVE_PERSONAL_DATA",
    ]);
    expect(questions[0]?.candidateEvidence[0]?.quote).toBe("Brazil");
    for (const question of questions.slice(1)) {
      expect(question.disposition).toBe("NEEDS_REVIEW");
      expect(question.suggestedAction).toContain("User confirmation required");
    }
  });
});
