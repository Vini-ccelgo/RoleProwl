import { describe, expect, it } from "vitest";
import { hasCapabilities, type SourceCapabilitySet } from "./capabilities";
describe("source capabilities", () => {
  it("requires every requested capability", () => {
    const set: SourceCapabilitySet = new Set([
      "READ_JOBS",
      "READ_APPLICATION_SCHEMA",
    ]);
    expect(hasCapabilities(set, ["READ_JOBS"])).toBe(true);
    expect(hasCapabilities(set, ["READ_JOBS", "SUBMIT_APPLICATION"])).toBe(
      false,
    );
  });
});
