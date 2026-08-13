import type { ApplicationState } from "@/core/domain/applications/application-tracker";
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
    await updateApplicationState({
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
