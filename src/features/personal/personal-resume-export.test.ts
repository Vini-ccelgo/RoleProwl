import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  exportPersonalResumeHtml,
  renderPersonalResumeHtml,
} from "./personal-resume-export";
import { personalJobFixture } from "./personal-test-fixture";
import type { PersonalStateJob } from "./personal-state";

function job(): PersonalStateJob {
  const snapshot = personalJobFixture();
  return {
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
}

describe("personal résumé HTML export", () => {
  it("produces a single-column ATS-readable artifact from source résumé text", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "roleprowl-resume-test-"));
    const resume =
      "Jordan Example\nSkills: Linux, SIEM\nExperience:\nAnalyzed security alerts";
    try {
      const path = await exportPersonalResumeHtml({
        applicationsDirectory: root,
        job: job(),
        resume,
      });
      const html = await readFile(path, "utf8");
      expect(html).toContain("<h2>Skills</h2>");
      expect(html).toContain("Analyzed security alerts");
      expect(html).not.toContain("<table");
      expect(renderPersonalResumeHtml({ job: job(), resume })).not.toContain(
        "invented",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
