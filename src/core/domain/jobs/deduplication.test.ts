import { describe, expect, it } from "vitest";
import {
  decideJobDeduplication,
  deriveObservedJobStatus,
  type DeduplicationCandidate,
} from "./deduplication";

const base: DeduplicationCandidate = {
  id: "job-1",
  source: "GREENHOUSE",
  externalId: "42",
  applicationUrl: "https://example.test/jobs/42",
  company: "Acme Inc.",
  title: "Senior Product Manager",
  locations: ["New York"],
  seniority: "SENIOR",
  description:
    "Lead product strategy for the marketplace platform and collaborate with engineering design and operations.",
  contentHash: "hash-1",
  postedAt: new Date("2026-07-01"),
  lastSeenAt: new Date("2026-08-01"),
  status: "ACTIVE",
};

const decision = (
  incoming: Partial<DeduplicationCandidate>,
  existing = [base],
) => decideJobDeduplication({ ...base, id: "incoming", ...incoming }, existing);

describe("job deduplication", () => {
  it("matches the same source external ID even when content changed", () => {
    expect(
      decision({ description: "Changed description", contentHash: "hash-2" }),
    ).toMatchObject({ kind: "MATCH", reason: "SOURCE_EXTERNAL_ID" });
  });

  it("matches the same application URL from two sources", () => {
    expect(decision({ source: "LEVER", externalId: "other" })).toMatchObject({
      kind: "MATCH",
      reason: "APPLICATION_URL",
    });
  });

  it("does not merge the same title in different locations", () => {
    expect(
      decision({
        source: "OTHER",
        externalId: "2",
        applicationUrl: null,
        locations: ["Boston"],
      }),
    ).toMatchObject({ kind: "NEW" });
  });

  it("does not merge the same employer with different seniority", () => {
    expect(
      decision({
        source: "OTHER",
        externalId: "2",
        applicationUrl: null,
        seniority: "JUNIOR",
      }),
    ).toMatchObject({ kind: "NEW" });
  });

  it("keeps a materially later repost as a new opening", () => {
    expect(
      decision(
        {
          source: "OTHER",
          externalId: "2",
          applicationUrl: null,
          postedAt: new Date("2026-09-15"),
        },
        [{ ...base, status: "STALE", lastSeenAt: new Date("2026-08-01") }],
      ),
    ).toMatchObject({ kind: "NEW" });
  });

  it("marks expired and repeatedly missing jobs without treating one miss as closure", () => {
    const now = new Date("2026-08-13");
    expect(
      deriveObservedJobStatus({
        now,
        expiresAt: new Date("2026-08-12"),
        lastSeenAt: now,
        missedRefreshes: 0,
      }),
    ).toBe("EXPIRED");
    expect(
      deriveObservedJobStatus({
        now,
        expiresAt: null,
        lastSeenAt: new Date("2026-08-01"),
        missedRefreshes: 3,
      }),
    ).toBe("STALE");
    expect(
      deriveObservedJobStatus({
        now,
        expiresAt: null,
        lastSeenAt: new Date("2026-08-12"),
        missedRefreshes: 1,
      }),
    ).toBe("ACTIVE");
  });
});
