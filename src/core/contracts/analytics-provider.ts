export const PRODUCT_EVENT_TYPES = [
  "JOB_DISCOVERED",
  "JOB_VIEWED",
  "JOB_SHORTLISTED",
  "JOB_REJECTED",
  "APPLICATION_PREPARED",
  "REVIEW_REQUESTED",
  "APPLICATION_SUBMITTED",
  "RESPONSE_RECEIVED",
  "INTERVIEW",
  "OFFER",
] as const;

export type ProductEventType = (typeof PRODUCT_EVENT_TYPES)[number];
export type ProductEventProperty =
  string | number | boolean | null | readonly string[];

export interface ProductEventInput {
  readonly dedupeKey: string;
  readonly entityId: string | null;
  readonly entityType: string;
  readonly eventType: ProductEventType;
  readonly occurredAt: Date;
  readonly properties?: Readonly<Record<string, ProductEventProperty>>;
  readonly userId: string | null;
}

export interface AnalyticsProvider {
  track(event: ProductEventInput): Promise<void>;
}
