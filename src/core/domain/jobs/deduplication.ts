import {
  normalizeCompany,
  normalizeJobTitle,
  normalizeLocations,
} from "./normalization";

export interface DeduplicationCandidate {
  readonly applicationUrl: string | null;
  readonly company: string;
  readonly contentHash: string;
  readonly description: string | null;
  readonly externalId: string;
  readonly id: string;
  readonly lastSeenAt: Date;
  readonly locations: readonly string[] | null;
  readonly postedAt: Date | null;
  readonly seniority: string | null;
  readonly source: string;
  readonly status: "ACTIVE" | "STALE" | "EXPIRED" | "CLOSED";
  readonly title: string;
}

export type DeduplicationDecision =
  | {
      readonly kind: "MATCH";
      readonly canonicalJobId: string;
      readonly reason: string;
    }
  | { readonly kind: "NEW"; readonly reason: string };

function words(value: string | null) {
  return new Set(
    (value ?? "")
      .toLocaleLowerCase("en-US")
      .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
      .split(/\s+/u)
      .filter((word) => word.length > 2),
  );
}

export function descriptionSimilarity(
  left: string | null,
  right: string | null,
) {
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / new Set([...a, ...b]).size;
}

function sameLocation(
  left: readonly string[] | null,
  right: readonly string[] | null,
) {
  const a = normalizeLocations(left);
  const b = normalizeLocations(right);
  if (a === null || b === null) return false;
  return a.some((location) => b.includes(location));
}

function looksLikeRepost(
  incoming: DeduplicationCandidate,
  existing: DeduplicationCandidate,
) {
  const gap = incoming.postedAt
    ? incoming.postedAt.getTime() - existing.lastSeenAt.getTime()
    : 0;
  return existing.status !== "ACTIVE" && gap > 30 * 24 * 60 * 60 * 1000;
}

export function decideJobDeduplication(
  incoming: DeduplicationCandidate,
  existingJobs: readonly DeduplicationCandidate[],
): DeduplicationDecision {
  const sourceMatch = existingJobs.find(
    (job) =>
      job.source === incoming.source && job.externalId === incoming.externalId,
  );
  if (sourceMatch) {
    return {
      kind: "MATCH",
      canonicalJobId: sourceMatch.id,
      reason: "SOURCE_EXTERNAL_ID",
    };
  }
  if (incoming.applicationUrl) {
    const urlMatch = existingJobs.find(
      (job) => job.applicationUrl === incoming.applicationUrl,
    );
    if (urlMatch) {
      return {
        kind: "MATCH",
        canonicalJobId: urlMatch.id,
        reason: "APPLICATION_URL",
      };
    }
  }

  const identityCandidates = existingJobs.filter(
    (job) =>
      normalizeCompany(job.company) === normalizeCompany(incoming.company) &&
      normalizeJobTitle(job.title) === normalizeJobTitle(incoming.title) &&
      job.seniority === incoming.seniority &&
      sameLocation(job.locations, incoming.locations),
  );
  const contentMatch = identityCandidates.find(
    (job) =>
      !looksLikeRepost(incoming, job) &&
      (job.contentHash === incoming.contentHash ||
        descriptionSimilarity(job.description, incoming.description) >= 0.82),
  );
  if (contentMatch) {
    return {
      kind: "MATCH",
      canonicalJobId: contentMatch.id,
      reason:
        contentMatch.contentHash === incoming.contentHash
          ? "IDENTITY_CONTENT_HASH"
          : "IDENTITY_DESCRIPTION_SIMILARITY",
    };
  }
  return { kind: "NEW", reason: "NO_CONSERVATIVE_MATCH" };
}

export function deriveObservedJobStatus(input: {
  readonly expiresAt: Date | null;
  readonly lastSeenAt: Date;
  readonly missedRefreshes: number;
  readonly now: Date;
}) {
  if (input.expiresAt && input.expiresAt <= input.now)
    return "EXPIRED" as const;
  if (
    input.missedRefreshes >= 3 ||
    input.now.getTime() - input.lastSeenAt.getTime() > 14 * 86400000
  ) {
    return "STALE" as const;
  }
  return "ACTIVE" as const;
}
