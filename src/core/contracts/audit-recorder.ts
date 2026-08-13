import type { SafeAuditEvent } from "@/core/domain/audit/audit-event";

export interface AuditRecorder {
  record(event: SafeAuditEvent): Promise<void>;
}
