import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { personalResultFixture } from "./personal-test-fixture";
import {
  loadFreshPersonalCache,
  mergePersonalState,
  personalCacheKey,
  savePersonalCache,
  updatePersonalJob,
} from "./personal-state";

describe("personal persistent state", () => {
  it("moves repeated opportunities from NEW to SEEN and preserves tracking", () => {
    const result = personalResultFixture();
    const first = mergePersonalState(
      { version: 1, jobs: {} },
      result,
      new Date("2026-08-17T00:00:00.000Z"),
    );
    expect(first.result.jobs[0].stateStatus).toBe("NEW");
    const shortlisted = updatePersonalJob(first.state, "0123456789abcdef", {
      status: "SHORTLISTED",
      note: "Review this week",
    });
    const second = mergePersonalState(
      shortlisted,
      result,
      new Date("2026-08-18T00:00:00.000Z"),
    );
    expect(second.result.jobs[0].stateStatus).toBe("SHORTLISTED");
    expect(second.state.jobs["0123456789abcdef"].notes).toEqual([
      "Review this week",
    ]);
    expect(second.state.jobs["0123456789abcdef"].fitHistory).toHaveLength(1);
    const applied = updatePersonalJob(
      second.state,
      "0123456789abcdef",
      { status: "APPLIED" },
      new Date("2026-08-19T00:00:00.000Z"),
    );
    expect(applied.jobs["0123456789abcdef"].appliedAt).toBe(
      "2026-08-19T00:00:00.000Z",
    );
  });

  it("uses a bounded local cache keyed without exposing input content", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "roleprowl-cache-test-"));
    try {
      const path = resolve(directory, "cache.json");
      const key = personalCacheKey({ resumeHash: "opaque", query: "security" });
      const result = personalResultFixture();
      await savePersonalCache({
        path,
        key,
        result,
        now: new Date("2026-08-17T00:00:00.000Z"),
      });
      await expect(
        loadFreshPersonalCache({
          path,
          key,
          now: new Date("2026-08-17T05:00:00.000Z"),
        }),
      ).resolves.toEqual(result);
      await expect(
        loadFreshPersonalCache({
          path,
          key,
          now: new Date("2026-08-17T07:00:00.000Z"),
        }),
      ).resolves.toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
