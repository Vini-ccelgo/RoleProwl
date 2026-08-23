import { describe, expect, it, vi } from "vitest";
import { invalidateReadyApplicationPackets } from "./invalidate-application-packets";

describe("application packet invalidation", () => {
  it("returns only ready pre-submission records to review", async () => {
    const database = {
      application: {
        findMany: vi.fn(async () => [{ id: "application-1" }]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      applicationEvent: { create: vi.fn(async () => undefined) },
    };
    await invalidateReadyApplicationPackets(database as never, "user-1");
    expect(database.application.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", state: "READY", submittedAt: null },
      select: { id: true },
    });
    expect(database.application.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: "NEEDS_REVIEW" },
        where: expect.objectContaining({ submittedAt: null }),
      }),
    );
    expect(database.applicationEvent.create).toHaveBeenCalledOnce();
  });
});
