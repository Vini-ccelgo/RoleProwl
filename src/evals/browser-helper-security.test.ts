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
      background: { service_worker: string };
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
    expect(manifest.background.service_worker).toBe("src/background.js");
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
  });

  it("uses session-only packets and contains no submission automation", async () => {
    const content = await readFile(path.join(root, "src/content.js"), "utf8");
    const background = await readFile(
      path.join(root, "src/background.js"),
      "utf8",
    );
    expect(content).not.toContain("storage.session");
    expect(content).toContain('type: "REQUEST_TRANSFER_PACKET"');
    expect(content).toContain('type: "STORE_TRANSFER_RESULT"');
    expect(background).toContain("storage.session");
    expect(background).toContain("sender?.tab?.url");
    expect(background).toContain("roleprowlTransferPacket");
    expect(background).toContain("roleprowlTransferResult");
    expect(content).not.toMatch(/\.submit\s*\(/u);
    expect(content).not.toMatch(/querySelector\([^)]*submit/iu);
    expect(content).not.toMatch(/document\.cookie|\.cookies?\b/iu);
    expect(content).toContain('"password"');
  });
});
