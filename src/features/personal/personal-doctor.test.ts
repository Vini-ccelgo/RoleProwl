import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectPersonalMode } from "./personal-doctor";

describe("personal doctor", () => {
  it("checks readiness without returning private résumé contents", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "roleprowl-doctor-test-"));
    const paths = {
      resume: resolve(root, "resume.txt"),
      preferences: resolve(root, "preferences.json"),
      sources: resolve(root, "sources.txt"),
      state: resolve(root, "state.json"),
      cache: resolve(root, "cache.json"),
      gitignore: resolve(root, ".gitignore"),
    };
    try {
      await writeFile(paths.resume, "PRIVATE RESUME CONTENT", "utf8");
      await writeFile(
        paths.gitignore,
        "personal/*\n!personal/README.md\n!personal/*.example.*\n",
        "utf8",
      );
      const result = await inspectPersonalMode({
        paths,
        environment: {},
        nodeVersion: "v24.1.0",
        packageManagerUserAgent: "pnpm/10.15.0 npm/? node/v24.1.0 linux x64",
      });
      expect(result.ready).toBe(true);
      expect(JSON.stringify(result)).not.toContain("PRIVATE RESUME CONTENT");
      expect(result.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "Résumé", status: "OK" }),
          expect.objectContaining({
            label: "Private files Git-ignored",
            status: "OK",
          }),
        ]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
