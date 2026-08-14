import { describe, expect, it } from "vitest";
import { consumeFixedWindow } from "./fixed-window-rate-limit";

describe("fixed-window rate limiting", () => {
  const rule = { limit: 2, windowMs: 60_000 };
  const startedAt = new Date("2026-08-13T12:00:00.000Z");

  it("permits up to the limit and denies requests for the remaining window", () => {
    const first = consumeFixedWindow({ current: null, now: startedAt, rule });
    expect(first.decision).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 60,
    });
    const second = consumeFixedWindow({
      current: first.bucket,
      now: new Date(startedAt.getTime() + 1_000),
      rule,
    });
    expect(second.decision).toMatchObject({ allowed: true, remaining: 0 });
    const denied = consumeFixedWindow({
      current: second.bucket,
      now: new Date(startedAt.getTime() + 2_000),
      rule,
    });
    expect(denied.decision).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 58,
    });
  });

  it("starts a new bucket after expiry", () => {
    const expired = {
      windowStartedAt: startedAt,
      requestCount: 99,
      expiresAt: new Date(startedAt.getTime() + rule.windowMs),
    };
    const next = consumeFixedWindow({
      current: expired,
      now: expired.expiresAt,
      rule,
    });
    expect(next.bucket.requestCount).toBe(1);
    expect(next.decision.allowed).toBe(true);
  });
});
