import type {
  AnalyticsProvider,
  ProductEventInput,
} from "@/core/contracts/analytics-provider";
import { logger } from "@/lib/logging/logger";

export async function trackProductEvent(
  analytics: AnalyticsProvider | undefined,
  event: ProductEventInput,
) {
  if (!analytics) return;
  try {
    await analytics.track(event);
  } catch (error) {
    logger.log("warn", "product_event_recording_failed", {
      eventType: event.eventType,
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }
}
