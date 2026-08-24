import { describe, expect, it, vi } from "vitest";
import { checkManualJobSearchRateLimit } from "./job-search-rate-limit";

describe("manual job-search abuse boundary", () => {
  it("consumes the fixed limit against the authenticated user", async () => {
    const consume = vi.fn().mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    await expect(
      checkManualJobSearchRateLimit({ consume }, "user-1"),
    ).resolves.toMatchObject({ allowed: false });
    expect(consume).toHaveBeenCalledWith("manual-job-search", "user-1", {
      limit: 6,
      windowMs: 3_600_000,
    });
  });
});
