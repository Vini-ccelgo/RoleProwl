import { describe, expect, it } from "vitest";
import {
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
});
