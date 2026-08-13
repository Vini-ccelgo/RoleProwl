import { describe, expect, it, vi } from "vitest";
import { markJobUnavailable } from "./mark-job-unavailable";

describe("job unavailable notification", () => {
  it("notifies only users with recorded interest", async () => {
    const notify = vi.fn(async () => undefined);
    const result = await markJobUnavailable({
      jobId: "job-1",
      notifications: { notify },
      repository: {
        markUnavailable: vi.fn(async () => ({
          title: "Product Manager",
          company: "Example",
          interestedUserIds: ["user-1", "user-2"],
        })),
      },
    });
    expect(result.notified).toBe(2);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "JOB_UNAVAILABLE", userId: "user-1" }),
    );
  });

  it("does not broadcast for an unknown job", async () => {
    const notify = vi.fn(async () => undefined);
    await expect(
      markJobUnavailable({
        jobId: "missing",
        notifications: { notify },
        repository: { markUnavailable: vi.fn(async () => null) },
      }),
    ).rejects.toThrow("Job not found");
    expect(notify).not.toHaveBeenCalled();
  });
});
