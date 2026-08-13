import "server-only";
import type { AuditRecorder } from "@/core/contracts/audit-recorder";
import { buildSafeAuditEvent } from "@/core/domain/audit/audit-event";
import type { Prisma } from "@/generated/prisma/client";
import { databaseClient } from "@/lib/db/client";

export class PrismaAuditRecorder implements AuditRecorder {
  async record(input: Parameters<AuditRecorder["record"]>[0]) {
    const event = buildSafeAuditEvent(input);
    await databaseClient().auditEvent.create({
      data: {
        ...event,
        metadata: event.metadata as Prisma.InputJsonObject,
      },
    });
  }
}
