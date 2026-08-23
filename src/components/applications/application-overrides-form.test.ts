import { describe, expect, it } from "vitest";
import { applicationOverridesAreDirty } from "./application-overrides-form";

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
});
