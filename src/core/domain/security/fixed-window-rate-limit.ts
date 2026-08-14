import type {
  RateLimitDecision,
  RateLimitRule,
} from "@/core/contracts/rate-limiter";

export interface FixedWindowBucket {
  readonly expiresAt: Date;
  readonly requestCount: number;
  readonly windowStartedAt: Date;
}

export function consumeFixedWindow(input: {
  readonly current: FixedWindowBucket | null;
  readonly now: Date;
  readonly rule: RateLimitRule;
}): {
  readonly bucket: FixedWindowBucket;
  readonly decision: RateLimitDecision;
} {
  if (!input.current || input.current.expiresAt <= input.now) {
    const expiresAt = new Date(input.now.getTime() + input.rule.windowMs);
    return {
      bucket: {
        windowStartedAt: input.now,
        requestCount: 1,
        expiresAt,
      },
      decision: {
        allowed: true,
        remaining: input.rule.limit - 1,
        retryAfterSeconds: Math.ceil(input.rule.windowMs / 1_000),
      },
    };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(
      (input.current.expiresAt.getTime() - input.now.getTime()) / 1_000,
    ),
  );
  if (input.current.requestCount >= input.rule.limit) {
    return {
      bucket: input.current,
      decision: { allowed: false, remaining: 0, retryAfterSeconds },
    };
  }
  return {
    bucket: {
      ...input.current,
      requestCount: input.current.requestCount + 1,
    },
    decision: {
      allowed: true,
      remaining: input.rule.limit - input.current.requestCount - 1,
      retryAfterSeconds,
    },
  };
}
