import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { preparePersonalApplication } from "./personal-application";
import { personalJobFixture } from "./personal-test-fixture";
import type { PersonalStateJob } from "./personal-state";

describe("personal application preparation", () => {
  it("creates a useful deterministic evidence package without submitting", async () => {
    const root = await mkdtemp(
      resolve(tmpdir(), "roleprowl-application-test-"),
    );
    const snapshot = personalJobFixture();
    const job: PersonalStateJob = {
      id: snapshot.id,
      firstSeenAt: "2026-08-17T00:00:00.000Z",
      lastSeenAt: "2026-08-17T00:00:00.000Z",
      status: "SHORTLISTED",
      fitHistory: [{ at: "2026-08-17T00:00:00.000Z", score: 82 }],
      notes: [],
      appliedAt: null,
      applicationPackagePath: null,
      snapshot,
    };
    try {
      const prepared = await preparePersonalApplication({
        applicationsDirectory: root,
        job,
        resume: "Skills: Linux and SIEM",
      });
      expect(prepared.generated).toEqual([
        "job.md",
        "fit-analysis.md",
        "evidence.md",
        "application-checklist.md",
      ]);
      await expect(
        readFile(resolve(prepared.directory, "evidence.md"), "utf8"),
      ).resolves.toContain("Required skill: Linux");
      await expect(
        readFile(
          resolve(prepared.directory, "application-checklist.md"),
          "utf8",
        ),
      ).resolves.toContain(
        "Submit only through the official application destination",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
