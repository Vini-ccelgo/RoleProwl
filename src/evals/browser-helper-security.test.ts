import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve("browser-helper");

describe("RoleProwl Greenhouse browser helper security contract", () => {
  it("limits persistent host access to official Greenhouse job-board domains", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, "manifest.json"), "utf8"),
    ) as {
      permissions: string[];
      host_permissions: string[];
      content_scripts: { matches: string[] }[];
    };
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
    expect(manifest.host_permissions).toEqual([
      "https://boards.greenhouse.io/*",
      "https://job-boards.greenhouse.io/*",
    ]);
    expect(manifest.content_scripts[0].matches).toEqual(
      manifest.host_permissions,
    );
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
  });

  it("uses session-only packets and contains no submission automation", async () => {
    const source = await readFile(path.join(root, "src/content.js"), "utf8");
    expect(source).toContain("storage.session");
    expect(source).toContain('remove("roleprowlTransferPacket")');
    expect(source).not.toMatch(/\.submit\s*\(/u);
    expect(source).not.toMatch(/querySelector\([^)]*submit/iu);
    expect(source).not.toMatch(/document\.cookie|\.cookies?\b/iu);
    expect(source).toContain('"password"');
  });
});
