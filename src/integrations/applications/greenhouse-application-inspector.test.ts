import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fetchGreenhouseApplicationQuestions,
  greenhouseQuestionReference,
  parseGreenhouseApplicationQuestions,
} from "./greenhouse-application-inspector";

const payload = {
  questions: [
    {
      required: true,
      label: "First Name",
      fields: [{ name: "first_name", type: "input_text" }],
    },
    {
      required: true,
      label: "Résumé/CV",
      fields: [{ name: "resume", type: "input_file" }],
    },
    {
      required: true,
      label: "Preferred shift",
      fields: [
        {
          name: "question_42",
          type: "multi_value_single_select",
          values: [{ label: "Day" }, { value: "Night" }],
        },
      ],
    },
    {
      required: false,
      label: "Work arrangement",
      fields: [
        {
          name: "question_43",
          type: "input_radio",
          values: ["Remote", "Hybrid"],
        },
      ],
    },
  ],
  compliance: [
    {
      questions: [
        {
          required: false,
          label: "Voluntary demographic information",
          fields: [{ name: "demographic", type: "multi_value_single_select" }],
        },
      ],
    },
  ],
  demographic_questions: {
    questions: [
      {
        id: 87,
        required: false,
        label: "Favorite color",
        type: "multi_value_multi_select",
        answer_options: [
          { id: 100, label: "Red" },
          { id: 101, label: "Blue" },
        ],
      },
    ],
  },
  data_compliance: [
    {
      type: "gdpr",
      requires_consent: true,
      requires_processing_consent: true,
      requires_retention_consent: true,
      retention_period: 365,
    },
  ],
};

describe("Greenhouse application inspector", () => {
  it("parses public field names without answering or submitting", () => {
    expect(parseGreenhouseApplicationQuestions(payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "First Name",
          required: true,
          fieldNames: ["first_name"],
        }),
        expect.objectContaining({ group: "COMPLIANCE" }),
        expect.objectContaining({
          id: "standard:question_42",
          fieldTypes: ["multi_value_single_select"],
          options: ["Day", "Night"],
          optionIdentities: [
            { label: "Day", value: "Day" },
            { label: "Night", value: "Night" },
          ],
        }),
        expect.objectContaining({
          id: "standard:question_43",
          fieldTypes: ["input_radio"],
          options: ["Remote", "Hybrid"],
        }),
        expect.objectContaining({
          id: "demographic:87",
          group: "DEMOGRAPHIC",
          fieldTypes: ["multi_value_multi_select"],
          options: ["Red", "Blue"],
          optionIdentities: [
            { label: "Red", value: "100" },
            { label: "Blue", value: "101" },
          ],
        }),
        expect.objectContaining({
          id: "data-compliance:1:gdpr_processing_consent_given",
          group: "COMPLIANCE",
          required: true,
          fieldTypes: ["external_consent"],
          optionIdentities: [
            { label: "Yes", value: "true" },
            { label: "No", value: "false" },
          ],
        }),
      ]),
    );
  });

  it("derives only fixed-host Greenhouse question references", () => {
    expect(
      greenhouseQuestionReference({
        source: "GREENHOUSE",
        externalId: "42",
        applicationUrl: "https://job-boards.greenhouse.io/acme/jobs/42",
      }),
    ).toEqual({ source: "GREENHOUSE", boardToken: "acme", jobId: "42" });
    expect(
      greenhouseQuestionReference({
        source: "GREENHOUSE",
        externalId: "42",
        applicationUrl: "https://example.com/acme/jobs/42",
      }),
    ).toBeNull();
  });

  it("uses the documented public questions endpoint and reports no transfer", async () => {
    const request = vi.fn(async () => Response.json(payload));
    const questions = await fetchGreenhouseApplicationQuestions(
      { source: "GREENHOUSE", boardToken: "acme", jobId: "42" },
      request,
    );
    expect(questions).toHaveLength(8);
    expect(request).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs/42?questions=true",
      expect.objectContaining({
        headers: { accept: "application/json" },
        redirect: "error",
      }),
    );
  });

  it("preserves authoritative cardinality for Inter-style controls", () => {
    const questions = parseGreenhouseApplicationQuestions({
      questions: [
        {
          required: true,
          label: "Você conhece alguém que trabalha no Inter?",
          fields: [
            {
              name: "question_1[]",
              type: "multi_value_multi_select",
              values: [
                { label: "Não conheço", value: 100 },
                { label: "Sim, um amigo", value: 200 },
              ],
            },
          ],
        },
        {
          required: true,
          label: "Em qual curso você se formou?",
          fields: [
            {
              name: "question_2[]",
              type: "multi_value_multi_select",
              values: [
                { label: "NA", value: 300 },
                { label: "Ciência da Computação", value: 400 },
              ],
            },
          ],
        },
      ],
    });

    expect(questions).toEqual([
      expect.objectContaining({
        fieldNames: ["question_1[]"],
        fieldTypes: ["multi_value_multi_select"],
        optionIdentities: [
          { label: "Não conheço", value: "100" },
          { label: "Sim, um amigo", value: "200" },
        ],
      }),
      expect.objectContaining({
        fieldNames: ["question_2[]"],
        fieldTypes: ["multi_value_multi_select"],
        optionIdentities: [
          { label: "NA", value: "300" },
          { label: "Ciência da Computação", value: "400" },
        ],
      }),
    ]);
  });
});
