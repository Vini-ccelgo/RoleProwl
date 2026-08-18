import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Neon configuration", () => {
  it("keeps PostgreSQL branch policy without obsolete object storage", () => {
    const source = readFileSync("neon.ts", "utf8");

    expect(source).toContain("auth: false");
    expect(source).toContain("branch:");
    expect(source).not.toContain("buckets:");
    expect(source).not.toContain("preview:");
  });
});
