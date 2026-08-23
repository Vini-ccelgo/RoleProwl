import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("candidate workflow page cleanup", () => {
  it("suppresses an absent résumé version and redundant readiness copy", async () => {
    const source = await readFile(
      path.resolve("src/app/(app)/applications/[applicationId]/page.tsx"),
      "utf8",
    );
    expect(source).toContain("{application.resumeVersion && (");
    expect(source).not.toContain("Unknown or no résumé was attached.");
    expect(source).not.toContain("Review preparation");
    expect(source).toContain("Mark application ready");
  });
});
