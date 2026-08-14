import "server-only";
import { createHash } from "node:crypto";
import type {
  RateLimitDecision,
  RateLimiter,
  RateLimitRule,
} from "@/core/contracts/rate-limiter";
import { ValidationError } from "@/core/errors/application-errors";
import { consumeFixedWindow } from "@/core/domain/security/fixed-window-rate-limit";
import { Prisma } from "@/generated/prisma/client";
import { databaseClient } from "@/lib/db/client";

function validateRule(scope: string, subject: string, rule: RateLimitRule) {
  if (!scope.trim() || !subject.trim())
    throw new ValidationError("A rate-limit scope and subject are required.");
  if (!Number.isInteger(rule.limit) || rule.limit < 1)
    throw new ValidationError("A positive rate-limit count is required.");
  if (!Number.isInteger(rule.windowMs) || rule.windowMs < 1_000)
    throw new ValidationError(
      "The rate-limit window must be at least one second.",
    );
}

export function rateLimitBucketKey(scope: string, subject: string) {
  return createHash("sha256").update(`${scope}\u0000${subject}`).digest("hex");
}

export class PrismaRateLimiter implements RateLimiter {
  async consume(
    scope: string,
    subject: string,
    rule: RateLimitRule,
  ): Promise<RateLimitDecision> {
    validateRule(scope, subject, rule);
    const key = rateLimitBucketKey(scope, subject);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await databaseClient().$transaction(
          async (transaction) => {
            const now = new Date();
            const current = await transaction.rateLimitBucket.findUnique({
              where: { key },
            });
            const next = consumeFixedWindow({ current, now, rule });
            if (next.decision.allowed) {
              await transaction.rateLimitBucket.upsert({
                where: { key },
                create: { key, ...next.bucket },
                update: next.bucket,
              });
            }
            return next.decision;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          attempt < 2 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034"
        )
          continue;
        throw error;
      }
    }
    throw new Error("The rate-limit transaction could not be completed.");
  }
}

export class AllowAllRateLimiter implements RateLimiter {
  async consume(
    _scope: string,
    _subject: string,
    rule: RateLimitRule,
  ): Promise<RateLimitDecision> {
    return {
      allowed: true,
      remaining: Math.max(0, rule.limit - 1),
      retryAfterSeconds: Math.ceil(rule.windowMs / 1_000),
    };
  }
}
