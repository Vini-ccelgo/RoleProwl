import type { AuditRecorder } from "@/core/contracts/audit-recorder";
import {
  buildSafeAuditEvent,
  type SafeAuditEvent,
} from "@/core/domain/audit/audit-event";

export async function recordAuditEvent(input: {
  readonly event: SafeAuditEvent;
  readonly recorder: AuditRecorder;
}) {
  await input.recorder.record(buildSafeAuditEvent(input.event));
}
