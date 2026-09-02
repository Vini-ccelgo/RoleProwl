import type {
  JobSourceAdapter,
  NormalizedSourceJob,
} from "@/core/contracts/job-source-adapter";
import { canonicalJobContentHash } from "@/core/domain/jobs/job";
import { JOB_EVIDENCE_VERSION } from "@/core/domain/jobs/job-evidence";
import { normalizeCanonicalJob } from "@/core/domain/jobs/normalization";
import { SourceAdapterError } from "@/core/errors/source-adapter-error";
import type { JobIngestionRepository } from "./ingest-normalized-job";

export interface CanonicalJobRefreshTarget {
  readonly id: string;
  readonly company: string;
  readonly contentHash: string;
  readonly evidenceVersion: string | null;
  readonly primarySource: {
    readonly applicationUrl: string | null;
    readonly externalId: string;
    readonly source: string;
    readonly sourceUrl: string | null;
  };
}

export interface JobEvidenceRefreshRepository {
  findCanonicalRefreshTarget(
    jobId: string,
  ): Promise<CanonicalJobRefreshTarget | null>;
  mergeSourceAssociation(
    input: Parameters<JobIngestionRepository["mergeSourceAssociation"]>[0],
  ): Promise<void>;
}

export interface JobEvidenceRefreshResult {
  readonly canonicalJobId: string;
  readonly evidenceChanged: boolean;
}

export async function refreshJobEvidence(input: {
  readonly createAdapter: (
    target: CanonicalJobRefreshTarget,
  ) => JobSourceAdapter;
  readonly jobId: string;
  readonly observedAt?: Date;
  readonly repository: JobEvidenceRefreshRepository;
}): Promise<JobEvidenceRefreshResult | null> {
  const target = await input.repository.findCanonicalRefreshTarget(input.jobId);
  if (!target) return null;

  const adapter = input.createAdapter(target);
  if (adapter.source !== target.primarySource.source) {
    throw new SourceAdapterError(
      target.primarySource.source,
      "WRONG_SOURCE",
      "The canonical job source cannot be refreshed by this adapter.",
    );
  }
  const refreshed = await adapter.refresh({
    source: target.primarySource.source,
    externalId: target.primarySource.externalId,
  });
  if (
    !refreshed ||
    refreshed.source !== target.primarySource.source ||
    refreshed.externalId !== target.primarySource.externalId
  ) {
    throw new SourceAdapterError(
      target.primarySource.source,
      "INVALID_RESPONSE",
      "The canonical job source returned no matching job.",
    );
  }

  const incoming = await adapter.normalize(refreshed);
  const canonical = normalizeCanonicalJob(incoming.canonical);
  const normalized: NormalizedSourceJob = { ...incoming, canonical };
  const contentHash = canonicalJobContentHash(canonical);
  const evidenceChanged =
    target.evidenceVersion !== JOB_EVIDENCE_VERSION ||
    target.contentHash !== contentHash;

  await input.repository.mergeSourceAssociation({
    canonicalJobId: target.id,
    contentHash,
    normalized,
    observedAt: input.observedAt ?? new Date(),
  });
  return { canonicalJobId: target.id, evidenceChanged };
}
