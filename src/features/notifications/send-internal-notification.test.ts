import { describe, expect, it, vi } from "vitest";
import { sendInternalNotification } from "./send-internal-notification";

describe("internal notifications", () => {
  it("sends a bounded first-party notification", async () => {
    const notify = vi.fn(async () => undefined);
    await sendInternalNotification({
      provider: { notify },
      notification: {
        userId: "user-1",
        type: "APPLICATION_NEEDS_REVIEW",
        title: " Review required ",
        body: " One application needs your decision. ",
        entityType: "reviewQueueItem",
        entityId: "queue-1",
        dedupeKey: "review:queue-1",
      },
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Review required",
        body: "One application needs your decision.",
      }),
    );
  });

  it("rejects empty or oversized content before persistence", async () => {
    const notify = vi.fn(async () => undefined);
    await expect(
      sendInternalNotification({
        provider: { notify },
        notification: {
          userId: "user-1",
          type: "WORKFLOW_FAILED",
          title: "",
          body: "x",
          dedupeKey: "failure:1",
        },
      }),
    ).rejects.toThrow("title");
    expect(notify).not.toHaveBeenCalled();
  });
});
