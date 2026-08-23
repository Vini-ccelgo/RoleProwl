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
        }),
        expect.objectContaining({
          id: "standard:question_43",
          fieldTypes: ["input_radio"],
          options: ["Remote", "Hybrid"],
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
    expect(questions).toHaveLength(5);
    expect(request).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs/42?questions=true",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
  });
});
