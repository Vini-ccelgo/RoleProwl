import type { GenerateContentResponse } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { z, type ZodType } from "zod";
import type { AITask } from "@/core/contracts/ai-provider";
import { aiTaskDefinitions } from "@/features/ai/task-definitions";
import type { GeminiRuntimeConfig } from "./gemini-model-config";
import {
  GeminiAIProvider,
  projectGeminiResponseSchema,
  type GeminiGenerateClient,
} from "./gemini-provider";

const GEMINI_RESPONSE_SCHEMA_KEYWORDS = new Set([
  "$anchor",
  "$defs",
  "$id",
  "$ref",
  "additionalProperties",
  "anyOf",
  "description",
  "enum",
  "format",
  "items",
  "maxItems",
  "maximum",
  "minItems",
  "minimum",
  "oneOf",
  "prefixItems",
  "properties",
  "propertyOrdering",
  "required",
  "title",
  "type",
]);

function object(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function unsupportedSchemaKeywords(value: unknown, path = "$"): string[] {
  if (typeof value === "boolean") return [];
  const schema = object(value);
  if (!schema) return [];
  const unsupported = Object.keys(schema)
    .filter((key) => !GEMINI_RESPONSE_SCHEMA_KEYWORDS.has(key))
    .map((key) => `${path}.${key}`);
  for (const key of ["properties", "$defs"] as const) {
    const children = object(schema[key]);
    if (children)
      for (const [name, child] of Object.entries(children))
        unsupported.push(
          ...unsupportedSchemaKeywords(child, `${path}.${key}.${name}`),
        );
  }
  for (const key of ["anyOf", "oneOf", "prefixItems"] as const) {
    const children = schema[key];
    if (Array.isArray(children))
      children.forEach((child, index) =>
        unsupported.push(
          ...unsupportedSchemaKeywords(child, `${path}.${key}[${index}]`),
        ),
      );
  }
  for (const key of ["items", "additionalProperties"] as const) {
    if (key in schema)
      unsupported.push(
        ...unsupportedSchemaKeywords(schema[key], `${path}.${key}`),
      );
  }
  return unsupported;
}

function keywordPaths(value: unknown, keyword: string, path = "$"): string[] {
  const schema = object(value);
  if (!schema) return [];
  const paths = keyword in schema ? [`${path}.${keyword}`] : [];
  for (const key of ["properties", "$defs"] as const) {
    const children = object(schema[key]);
    if (children)
      for (const [name, child] of Object.entries(children))
        paths.push(...keywordPaths(child, keyword, `${path}.${key}.${name}`));
  }
  for (const key of ["anyOf", "oneOf", "prefixItems"] as const) {
    const children = schema[key];
    if (Array.isArray(children))
      children.forEach((child, index) =>
        paths.push(...keywordPaths(child, keyword, `${path}.${key}[${index}]`)),
      );
  }
  for (const key of ["items", "additionalProperties"] as const) {
    if (key in schema)
      paths.push(...keywordPaths(schema[key], keyword, `${path}.${key}`));
  }
  return paths;
}

const config: GeminiRuntimeConfig = {
  liteModel: "gemini-3.5-flash-lite",
  flashModel: "gemini-3.5-flash",
  liteRpmLimit: 12,
  liteRpdLimit: 450,
  flashRpmLimit: 4,
  flashRpdLimit: 15,
  maxRetries: 0,
  timeoutMs: 1_000,
};

const outputs: Readonly<Record<AITask, unknown>> = {
  RESUME_FACT_EXTRACTION: { proposals: [] },
  JOB_REQUIREMENT_NORMALIZATION: {
    required: [],
    preferred: [],
    contradictions: [],
    unknowns: [],
  },
  SEMANTIC_EVIDENCE_COMPARISON: {
    supported: true,
    classification: "DIRECT_FACT",
    evidenceIds: ["synthetic-evidence-1"],
    explanation: "The fictional evidence directly supports the claim.",
  },
  APPLICATION_QUESTION_CLASSIFICATION: {
    classification: "JOB_SPECIFIC_FREE_TEXT",
    confidence: 0.91,
    rationale: "This asks for a role-specific narrative.",
  },
  FREE_TEXT_APPLICATION_GENERATION: {
    text: "A synthetic response grounded in the supplied fixture.",
    claims: [],
  },
  RESUME_TAILORING: {
    headline: "Synthetic Platform Engineer",
    summary: "A fictional candidate used only for manual alpha testing.",
    sections: [],
    claims: [],
  },
  COVER_LETTER_GENERATION: {
    subject: "Synthetic application",
    body: "This fictional candidate is applying in a controlled test.",
    claims: [],
  },
};

const expectedModel: Readonly<Record<AITask, string>> = {
  RESUME_FACT_EXTRACTION: config.liteModel,
  JOB_REQUIREMENT_NORMALIZATION: config.liteModel,
  SEMANTIC_EVIDENCE_COMPARISON: config.liteModel,
  APPLICATION_QUESTION_CLASSIFICATION: config.liteModel,
  FREE_TEXT_APPLICATION_GENERATION: config.liteModel,
  RESUME_TAILORING: config.flashModel,
  COVER_LETTER_GENERATION: config.flashModel,
};

describe("Gemini compatibility with RoleProwl task schemas", () => {
  it("projects the exact cover-letter schema without weakening canonical validation", () => {
    const definition = aiTaskDefinitions.COVER_LETTER_GENERATION;
    const canonical = z.toJSONSchema(definition.schema, {
      unrepresentable: "any",
    });
    const projected = projectGeminiResponseSchema(definition.schema);

    expect(keywordPaths(canonical, "maxLength")).toEqual([
      "$.properties.subject.anyOf[0].maxLength",
      "$.properties.body.maxLength",
      "$.properties.claims.items.properties.text.maxLength",
      "$.properties.claims.items.properties.assertions.items.properties.value.maxLength",
      "$.properties.claims.items.properties.sourceEvidence.items.properties.evidenceType.maxLength",
      "$.properties.claims.items.properties.sourceEvidence.items.properties.evidenceId.maxLength",
      "$.properties.claims.items.properties.sourceEvidence.items.properties.evidenceField.maxLength",
    ]);
    expect(keywordPaths(projected, "maxLength")).toEqual([]);
    expect(projected).not.toHaveProperty("$schema");
    expect(unsupportedSchemaKeywords(projected)).toEqual([]);
    expect(projected).toMatchObject({
      type: "object",
      required: ["subject", "body", "claims"],
      additionalProperties: false,
      properties: {
        subject: { anyOf: [{ type: "string" }, { type: "null" }] },
        body: { type: "string" },
        claims: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            required: [
              "text",
              "classification",
              "assertions",
              "sourceEvidence",
            ],
            additionalProperties: false,
            properties: {
              classification: {
                type: "string",
                enum: [
                  "DIRECT_FACT",
                  "SUPPORTED_REWRITE",
                  "SUPPORTED_INFERENCE",
                  "UNSUPPORTED",
                ],
              },
              assertions: {
                type: "array",
                maxItems: 50,
                items: {
                  type: "object",
                  required: ["kind", "value"],
                  additionalProperties: false,
                },
              },
              sourceEvidence: {
                type: "array",
                maxItems: 50,
                items: {
                  type: "object",
                  required: ["evidenceType", "evidenceId", "evidenceField"],
                  additionalProperties: false,
                },
              },
            },
          },
        },
      },
    });
    expect(
      definition.schema.safeParse({
        subject: null,
        body: "x".repeat(5_001),
        claims: [],
      }).success,
    ).toBe(false);
    expect(
      definition.schema.safeParse({
        subject: null,
        body: "Synthetic body",
        claims: [
          {
            text: "Synthetic claim",
            classification: "DIRECT_FACT",
            assertions: [],
            sourceEvidence: [
              {
                evidenceType: "CANDIDATE_FACT",
                evidenceId: "x".repeat(129),
                evidenceField: "value",
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      z.toJSONSchema(definition.schema, { unrepresentable: "any" }),
    ).toEqual(canonical);
  });

  it("recursively projects future nested object, array, and union schemas", () => {
    const schema = z.object({
      groups: z
        .array(
          z.object({
            value: z.union([z.string().max(8), z.number().max(10)]),
          }),
        )
        .min(1)
        .max(3),
    });
    const projected = projectGeminiResponseSchema(schema);

    expect(keywordPaths(projected, "maxLength")).toEqual([]);
    expect(unsupportedSchemaKeywords(projected)).toEqual([]);
    expect(projected).toMatchObject({
      type: "object",
      properties: {
        groups: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              value: {
                anyOf: [{ type: "string" }, { type: "number", maximum: 10 }],
              },
            },
          },
        },
      },
    });
  });

  for (const task of Object.keys(aiTaskDefinitions) as AITask[]) {
    it(`validates ${task} through its real schema`, async () => {
      const generateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify(outputs[task]),
        responseId: `response-${task.toLowerCase()}`,
      } as unknown as GenerateContentResponse);
      const definition = aiTaskDefinitions[task];
      const result = await new GeminiAIProvider(
        { generateContent } as GeminiGenerateClient,
        config,
        { log: vi.fn() },
      ).generateStructured({
        correlationId: `fixture-${task.toLowerCase()}`,
        input: { fixture: "fictional-candidate-v1" },
        promptVersion: definition.promptVersion,
        rateLimitSubject: "synthetic-candidate",
        schema: definition.schema as ZodType<unknown>,
        schemaName: definition.schemaName,
        system: definition.system,
        task,
      });
      expect(result.data).toEqual(outputs[task]);
      expect(result.metadata.model).toBe(expectedModel[task]);
      expect(generateContent).toHaveBeenCalledTimes(1);
      const projected =
        generateContent.mock.calls[0]![0].config?.responseJsonSchema;
      expect(unsupportedSchemaKeywords(projected)).toEqual([]);
      expect(keywordPaths(projected, "maxLength")).toEqual([]);
    });
  }
});
