import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("personal file privacy", () => {
  it("ignores all personal files while retaining only documentation and examples", async () => {
    const ignore = await readFile(resolve(process.cwd(), ".gitignore"), "utf8");
    expect(ignore).toContain("personal/*");
    expect(ignore).toContain("!personal/README.md");
    expect(ignore).toContain("!personal/*.example.*");
  });
});
