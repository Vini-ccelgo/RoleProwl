import type { CanonicalJobInput } from "@/core/domain/jobs/job";
import type { SourceCapabilitySet } from "@/core/types/capabilities";

export interface JobReference {
  readonly source: string;
  readonly externalId: string;
}

export interface RawSourceJob extends JobReference {
  readonly applicationUrl: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sourceUrl: string | null;
}

export interface JobDiscoveryQuery {
  readonly query: string;
  readonly location?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface JobDiscoveryPage {
  readonly jobs: readonly RawSourceJob[];
  readonly nextCursor: string | null;
}

export interface NormalizedSourceJob {
  readonly canonical: CanonicalJobInput;
  readonly source: RawSourceJob;
}

export interface JobSourceAdapter {
  readonly source: string;
  discover(query: JobDiscoveryQuery): Promise<JobDiscoveryPage>;
  fetch(reference: JobReference): Promise<RawSourceJob | null>;
  normalize(job: RawSourceJob): Promise<NormalizedSourceJob>;
  refresh(reference: JobReference): Promise<RawSourceJob | null>;
  getCapabilities(): SourceCapabilitySet;
}

export interface SourceHealthEvent {
  readonly source: string;
  readonly status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface SourceHealthReporter {
  report(event: SourceHealthEvent): Promise<void>;
}
