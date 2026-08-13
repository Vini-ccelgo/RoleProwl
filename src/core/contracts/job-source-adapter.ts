import type { SourceCapabilitySet } from "@/core/types/capabilities";
export interface JobReference {
  readonly source: string;
  readonly externalId: string;
}
export interface DiscoveredJob extends JobReference {
  readonly title: string;
  readonly organization: string;
  readonly location: string | null;
}
export interface JobDiscoveryQuery {
  readonly query: string;
  readonly location?: string;
  readonly cursor?: string;
}
export interface JobSourceAdapter {
  discover(query: JobDiscoveryQuery): Promise<readonly DiscoveredJob[]>;
  fetchJob(reference: JobReference): Promise<DiscoveredJob | null>;
  getCapabilities(): SourceCapabilitySet;
}
