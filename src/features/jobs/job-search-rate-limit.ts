import type { RateLimiter } from "@/core/contracts/rate-limiter";

export const MANUAL_JOB_SEARCH_RATE_LIMIT = {
  limit: 6,
  windowMs: 60 * 60 * 1_000,
} as const;

export function checkManualJobSearchRateLimit(
  rateLimiter: RateLimiter,
  userId: string,
) {
  return rateLimiter.consume(
    "manual-job-search",
    userId,
    MANUAL_JOB_SEARCH_RATE_LIMIT,
  );
}
