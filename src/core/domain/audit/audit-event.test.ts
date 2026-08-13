import { describe, expect, it } from "vitest";
import { buildSafeAuditEvent } from "./audit-event";

describe("safe audit events", () => {
  it("keeps only action-specific safe metadata", () => {
    expect(
      buildSafeAuditEvent({
        actorUserId: "user-1",
        action: "APPLICATION_SUBMITTED",
        entityType: "application",
        entityId: "application-1",
        metadata: {
          mechanism: "EXTERNAL_APPLICATION",
          confirmation: "USER_CONFIRMED_EXTERNAL",
          answers: { salary: 100_000 },
          token: "secret",
        },
      }).metadata,
    ).toEqual({
      mechanism: "EXTERNAL_APPLICATION",
      confirmation: "USER_CONFIRMED_EXTERNAL",
    });
  });

  it("does not retain nested content even under an allowed key", () => {
    expect(
      buildSafeAuditEvent({
        actorUserId: null,
        action: "STATUS_CHANGED",
        entityType: "application",
        entityId: "application-1",
        metadata: { fromState: { raw: "SUBMITTED" }, toState: "INTERVIEW" },
      }).metadata,
    ).toEqual({ toState: "INTERVIEW" });
  });
});
