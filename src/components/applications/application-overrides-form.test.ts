import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ApplicationOverridesForm,
  applicationOverridesAreDirty,
  normalizeEditableValue,
} from "./application-overrides-form";

describe("application override dirty state", () => {
  it("enables only for a changed editable value and becomes clean when reverted", () => {
    const initial = {
      "identity:email": "candidate@example.test",
      "answer:question-42": "Yes",
    };
    const clean = new FormData();
    clean.set("identity:email", "candidate@example.test");
    clean.set("answer:question-42", "Yes");
    expect(applicationOverridesAreDirty(initial, clean)).toBe(false);

    clean.set("answer:question-42", "No");
    expect(applicationOverridesAreDirty(initial, clean)).toBe(true);

    clean.set("answer:question-42", "Yes");
    expect(applicationOverridesAreDirty(initial, clean)).toBe(false);
  });

  it("normalizes optional empties and textarea line endings consistently", () => {
    expect(normalizeEditableValue(undefined)).toBe("");
    expect(normalizeEditableValue(null)).toBe("");
    expect(normalizeEditableValue("")).toBe("");
    expect(normalizeEditableValue("line one\r\nline two")).toBe(
      "line one\nline two",
    );

    const initial = {
      "identity:phone": undefined,
      "answer:text": "",
      "answer:textarea": "line one\r\nline two",
      "answer:resolved-choice": "Day",
      "answer:unresolved-choice": null,
    };
    const current = new FormData();
    current.set("identity:phone", "");
    current.set("answer:text", "");
    current.set("answer:textarea", "line one\nline two");
    current.set("answer:resolved-choice", "Day");
    expect(applicationOverridesAreDirty(initial, current)).toBe(false);

    current.set("answer:resolved-choice", "Night");
    expect(applicationOverridesAreDirty(initial, current)).toBe(true);
    current.set("answer:resolved-choice", "Day");
    expect(applicationOverridesAreDirty(initial, current)).toBe(false);
  });

  it("renders stable raw identities for exact consent and multi-select decisions", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationOverridesForm, {
        applicationId: "application-1",
        saveAction: async () => undefined,
        fields: [
          {
            key: "question:privacy",
            questionId: "privacy",
            questionGroup: "COMPLIANCE",
            label: "Inter privacy consent",
            required: true,
            status: "UNRESOLVED",
            value: null,
            provenance: [],
            classification: "APPLICATION_SPECIFIC",
            fieldNames: ["privacy_consent"],
            fieldTypes: ["external_consent"],
            options: ["Yes", "No"],
            optionIdentities: [
              { label: "Yes", value: "true" },
              { label: "No", value: "false" },
            ],
          },
          {
            key: "question:locations",
            questionId: "locations",
            questionGroup: "STANDARD",
            label: "Preferred offices",
            required: true,
            status: "RESOLVED",
            value: '["100","300"]',
            provenance: [
              {
                source: "APPLICATION_OVERRIDE",
                label: "Application-specific candidate answer",
              },
            ],
            classification: "APPLICATION_SPECIFIC",
            fieldNames: ["locations[]"],
            fieldTypes: ["multi_value_multi_select"],
            options: ["São Paulo", "Recife", "Curitiba"],
            optionIdentities: [
              { label: "São Paulo", value: "100" },
              { label: "Recife", value: "200" },
              { label: "Curitiba", value: "300" },
            ],
          },
        ],
      }),
    );
    expect(markup).toContain("Inter privacy consent (required)");
    expect(markup).toContain('value="true"');
    expect(markup).toContain('value="false"');
    expect(markup).toContain('data-choice-cardinality="single"');
    expect(markup).toContain('name="answer:locations"');
    expect(markup).toContain('data-choice-cardinality="multiple"');
    expect(markup).toContain('data-bounded-choice-list="true"');
    expect(markup).toContain('class="application-choice-input"');
    expect(markup).toMatch(/checked="" value="100"/u);
    expect(markup).toMatch(/checked="" value="300"/u);
    expect(markup).not.toMatch(/checked="" value="200"/u);
  });

  it("requires one checkbox in an empty multi-select group, not every option", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationOverridesForm, {
        applicationId: "application-1",
        saveAction: async () => undefined,
        fields: [
          {
            key: "question:course",
            questionId: "course",
            questionGroup: "STANDARD",
            label: "Degree course",
            required: true,
            status: "UNRESOLVED",
            value: null,
            provenance: [],
            classification: "APPLICATION_SPECIFIC",
            fieldNames: ["course[]"],
            fieldTypes: ["multi_value_multi_select"],
            options: ["NA", "Computer Science", "Engineering"],
            optionIdentities: [
              { label: "NA", value: "100" },
              { label: "Computer Science", value: "200" },
              { label: "Engineering", value: "300" },
            ],
          },
        ],
      }),
    );

    expect(markup).toContain("Select at least one option.");
    expect(markup.match(/type="checkbox"/gu)).toHaveLength(3);
    expect(markup.match(/required=""/gu)).toHaveLength(1);
    expect(markup).toContain("max-h-64");
    expect(markup).toContain("overflow-y-auto");
  });

  it("compares repeated selections as one canonical application answer", () => {
    const current = new FormData();
    current.append("answer:locations", "");
    current.append("answer:locations", "100");
    current.append("answer:locations", "300");
    expect(
      applicationOverridesAreDirty(
        { "answer:locations": '["100","300"]' },
        current,
      ),
    ).toBe(false);
  });
});
