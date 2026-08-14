import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsProvider } from "@/core/contracts/analytics-provider";
import { trackProductEvent } from "./track-product-event";

const event = {
  dedupeKey: "job-viewed:user-1:job-1:2026-08-13",
  entityId: "job-1",
  entityType: "job",
  eventType: "JOB_VIEWED" as const,
  occurredAt: new Date("2026-08-13T12:00:00.000Z"),
  properties: { surface: "jobs" },
  userId: "user-1",
};

afterEach(() => vi.restoreAllMocks());

describe("product event tracking", () => {
  it("invokes the configured provider", async () => {
    const analytics: AnalyticsProvider = { track: vi.fn() };
    await trackProductEvent(analytics, event);
    expect(analytics.track).toHaveBeenCalledWith(event);
  });

  it("does not break product behavior when optional analytics fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const analytics: AnalyticsProvider = {
      track: vi.fn().mockRejectedValue(new Error("unavailable")),
    };
    await expect(trackProductEvent(analytics, event)).resolves.toBeUndefined();
  });
});
