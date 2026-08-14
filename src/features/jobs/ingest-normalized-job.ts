import type { NormalizedSourceJob } from "@/core/contracts/job-source-adapter";
import type { AnalyticsProvider } from "@/core/contracts/analytics-provider";
import { canonicalJobContentHash } from "@/core/domain/jobs/job";
import {
  decideJobDeduplication,
  type DeduplicationCandidate,
} from "@/core/domain/jobs/deduplication";
import { normalizeCanonicalJob } from "@/core/domain/jobs/normalization";
import { trackProductEvent } from "@/features/analytics/track-product-event";

export interface JobIngestionRepository {
  findDeduplicationCandidates(input: {
    readonly applicationUrl: string | null;
    readonly company: string;
    readonly source: string;
    readonly externalId: string;
    readonly title: string;
  }): Promise<readonly DeduplicationCandidate[]>;
  createCanonicalWithSource(input: {
    readonly contentHash: string;
    readonly observedAt: Date;
    readonly normalized: NormalizedSourceJob;
  }): Promise<string>;
  mergeSourceAssociation(input: {
    readonly canonicalJobId: string;
    readonly contentHash: string;
    readonly observedAt: Date;
    readonly normalized: NormalizedSourceJob;
  }): Promise<void>;
}

export async function ingestNormalizedJob(
  incoming: NormalizedSourceJob,
  repository: JobIngestionRepository,
  observedAt = new Date(),
  analytics?: AnalyticsProvider,
) {
  const canonical = normalizeCanonicalJob(incoming.canonical);
  const normalized = { ...incoming, canonical };
  const contentHash = canonicalJobContentHash(canonical);
  const candidates = await repository.findDeduplicationCandidates({
    source: incoming.source.source,
    externalId: incoming.source.externalId,
    applicationUrl: canonical.canonicalApplicationUrl,
    company: canonical.company,
    title: canonical.title,
  });
  const decision = decideJobDeduplication(
    {
      id: "incoming",
      source: incoming.source.source,
      externalId: incoming.source.externalId,
      applicationUrl: canonical.canonicalApplicationUrl,
      company: canonical.company,
      title: canonical.title,
      description: canonical.description,
      locations: canonical.locations,
      seniority: canonical.seniority,
      contentHash,
      postedAt: canonical.postedAt,
      lastSeenAt: observedAt,
      status: "ACTIVE",
    },
    candidates,
  );
  if (decision.kind === "MATCH") {
    await repository.mergeSourceAssociation({
      canonicalJobId: decision.canonicalJobId,
      contentHash,
      observedAt,
      normalized,
    });
    return {
      canonicalJobId: decision.canonicalJobId,
      created: false,
      reason: decision.reason,
    };
  }
  const canonicalJobId = await repository.createCanonicalWithSource({
    contentHash,
    observedAt,
    normalized,
  });
  await trackProductEvent(analytics, {
    dedupeKey: `job-discovered:${canonicalJobId}:${contentHash.slice(0, 16)}`,
    entityId: canonicalJobId,
    entityType: "job",
    eventType: "JOB_DISCOVERED",
    occurredAt: observedAt,
    properties: { source: incoming.source.source, newCanonical: true },
    userId: null,
  });
  return { canonicalJobId, created: true, reason: decision.reason };
}
