export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(
    scope: string,
    subject: string,
    rule: RateLimitRule,
  ): Promise<RateLimitDecision>;
}
