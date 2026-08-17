import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
        "application.md",
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
      await expect(
        readFile(resolve(prepared.directory, "application.md"), "utf8"),
      ).resolves.toContain("Application Control Sheet");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds publicly exposed Greenhouse questions to the same dossier", async () => {
    const root = await mkdtemp(
      resolve(tmpdir(), "roleprowl-application-questions-test-"),
    );
    const snapshot = personalJobFixture({
      sources: [
        {
          source: "GREENHOUSE",
          label: "Greenhouse/Example Corp",
          sourceJobId: "101",
          sourceUrl: "https://boards.greenhouse.io/example/jobs/101",
          questionReference: {
            source: "GREENHOUSE",
            boardToken: "example",
            jobId: "101",
          },
        },
      ],
    });
    const job: PersonalStateJob = {
      id: snapshot.id,
      firstSeenAt: "2026-08-17T00:00:00.000Z",
      lastSeenAt: "2026-08-17T00:00:00.000Z",
      status: "SHORTLISTED",
      fitHistory: [],
      notes: [],
      appliedAt: null,
      applicationPackagePath: null,
      snapshot,
    };
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            questions: [
              {
                required: true,
                label: "Are you legally authorized to work in Brazil?",
                fields: [
                  { name: "authorization", type: "input_text", values: [] },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    try {
      const prepared = await preparePersonalApplication({
        applicationsDirectory: root,
        job,
        request,
        resume:
          "Work authorization: Authorized to work in Brazil; no sponsorship required",
      });
      expect(prepared.generated).toContain("questions.md");
      expect(prepared.questionCount).toBe(1);
      await expect(
        readFile(resolve(prepared.directory, "questions.md"), "utf8"),
      ).resolves.toContain("User confirmation required");
      await expect(
        readFile(resolve(prepared.directory, "application.md"), "utf8"),
      ).resolves.toContain(
        "1 of 1 retrieved questions require explicit review",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
