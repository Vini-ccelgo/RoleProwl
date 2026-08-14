import {
  assertApplicationTransition,
  type ApplicationState,
} from "@/core/domain/applications/application-tracker";
import { NotFoundError } from "@/core/errors/application-errors";
import type {
  AnalyticsProvider,
  ProductEventType,
} from "@/core/contracts/analytics-provider";
import { trackProductEvent } from "@/features/analytics/track-product-event";

const ANALYTICS_EVENT_FOR_STATE: Partial<
  Record<ApplicationState, ProductEventType>
> = {
  RESPONSE: "RESPONSE_RECEIVED",
  INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
};

export interface ApplicationTrackerRepository {
  findState(input: {
    readonly applicationId: string;
    readonly userId: string;
  }): Promise<ApplicationState | null>;
  transition(input: {
    readonly applicationId: string;
    readonly detail: Readonly<Record<string, unknown>> | null;
    readonly from: ApplicationState;
    readonly to: ApplicationState;
    readonly userId: string;
  }): Promise<void>;
}

export async function updateApplicationState(input: {
  readonly analytics?: AnalyticsProvider;
  readonly applicationId: string;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly next: ApplicationState;
  readonly repository: ApplicationTrackerRepository;
  readonly userId: string;
}) {
  const current = await input.repository.findState({
    applicationId: input.applicationId,
    userId: input.userId,
  });
  if (!current) throw new NotFoundError("Application not found.");
  assertApplicationTransition(current, input.next);
  await input.repository.transition({
    applicationId: input.applicationId,
    detail: input.detail ?? null,
    from: current,
    to: input.next,
    userId: input.userId,
  });
  const eventType = ANALYTICS_EVENT_FOR_STATE[input.next];
  if (eventType) {
    await trackProductEvent(input.analytics, {
      dedupeKey: `${eventType.toLowerCase().replaceAll("_", "-")}:${input.applicationId}`,
      entityId: input.applicationId,
      entityType: "application",
      eventType,
      occurredAt: new Date(),
      properties: { source: "USER_REPORTED" },
      userId: input.userId,
    });
  }
}
