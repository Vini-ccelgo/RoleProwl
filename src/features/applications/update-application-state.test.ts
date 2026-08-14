import type { ApplicationState } from "@/core/domain/applications/application-tracker";
import type { AnalyticsProvider } from "@/core/contracts/analytics-provider";
import { describe, expect, it, vi } from "vitest";
import {
  updateApplicationState,
  type ApplicationTrackerRepository,
} from "./update-application-state";

function repository(state: ApplicationState | null) {
  return {
    findState: vi.fn(async () => state),
    transition: vi.fn(async () => undefined),
  } satisfies ApplicationTrackerRepository;
}

describe("update application state", () => {
  it("records an owner-scoped valid transition", async () => {
    const repo = repository("SUBMITTED");
    const analytics: AnalyticsProvider = { track: vi.fn() };
    await updateApplicationState({
      analytics,
      applicationId: "application-1",
      userId: "user-1",
      next: "INTERVIEW",
      detail: { note: "First interview" },
      repository: repo,
    });
    expect(repo.findState).toHaveBeenCalledWith({
      applicationId: "application-1",
      userId: "user-1",
    });
    expect(repo.transition).toHaveBeenCalledWith(
      expect.objectContaining({ from: "SUBMITTED", to: "INTERVIEW" }),
    );
    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "INTERVIEW",
        entityId: "application-1",
        userId: "user-1",
      }),
    );
  });

  it("conceals a missing or foreign application", async () => {
    await expect(
      updateApplicationState({
        applicationId: "foreign",
        userId: "user-1",
        next: "CLOSED",
        repository: repository(null),
      }),
    ).rejects.toThrow("Application not found");
  });
});
