import "server-only";
import type {
  SourceHealthEvent,
  SourceHealthReporter,
} from "@/core/contracts/job-source-adapter";
import { databaseClient } from "@/lib/db/client";

export class PrismaSourceHealthReporter implements SourceHealthReporter {
  async report(event: SourceHealthEvent) {
    const failed = event.status !== "HEALTHY";
    await databaseClient().jobSourceHealth.upsert({
      where: { source: event.source },
      create: {
        source: event.source,
        status: event.status,
        consecutiveFailures: failed ? 1 : 0,
        lastSuccessAt: failed ? undefined : new Date(),
        lastFailureAt: failed ? new Date() : undefined,
        lastErrorCode: event.errorCode,
        lastErrorMessage: event.errorMessage,
      },
      update: {
        status: event.status,
        consecutiveFailures: failed ? { increment: 1 } : 0,
        lastSuccessAt: failed ? undefined : new Date(),
        lastFailureAt: failed ? new Date() : undefined,
        lastErrorCode: failed ? event.errorCode : null,
        lastErrorMessage: failed ? event.errorMessage : null,
      },
    });
  }
}
