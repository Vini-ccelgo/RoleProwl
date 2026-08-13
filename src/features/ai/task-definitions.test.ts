import { describe, expect, it } from "vitest";
import { AI_TASKS } from "@/core/contracts/ai-provider";
import { aiTaskDefinitions } from "./task-definitions";

describe("AI task definitions", () => {
  it("defines one versioned schema and prompt for every governed task", () => {
    expect(Object.keys(aiTaskDefinitions).sort()).toEqual([...AI_TASKS].sort());
    expect(
      new Set(
        Object.values(aiTaskDefinitions).map(
          ({ promptVersion }) => promptVersion,
        ),
      ).size,
    ).toBe(AI_TASKS.length);
    for (const definition of Object.values(aiTaskDefinitions)) {
      expect(definition.system.length).toBeGreaterThan(40);
      expect(definition.schemaName).toMatch(/^[a-z][a-z0-9_]+$/);
      expect(definition.schema.safeParse({ fabricated: true }).success).toBe(
        false,
      );
    }
  });

  it("keeps evidence references in generated-claim schemas", () => {
    const result = aiTaskDefinitions.RESUME_TAILORING.schema.safeParse({
      headline: "Engineer",
      summary: "Candidate-specific assertion",
      sections: [],
      claims: [
        {
          text: "Built systems",
          classification: "DIRECT_FACT",
          assertions: [],
          sourceEvidence: [
            {
              evidenceType: "fact",
              evidenceId: "fact-1",
              evidenceField: "value",
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
