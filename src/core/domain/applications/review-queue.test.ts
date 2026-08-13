import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ValidationError,
} from "@/core/errors/application-errors";
import {
  buildAuditedReviewMutation,
  transitionReviewQueueItem,
} from "./review-queue";

describe("review queue transitions", () => {
  it.each([
    ["APPROVED", "APPROVED"],
    ["REJECTED", "REJECTED"],
  ] as const)("moves a pending item through %s", (action, status) => {
    expect(
      transitionReviewQueueItem({ action, currentStatus: "PENDING" })
        .nextStatus,
    ).toBe(status);
  });

  it("defers only to a future time", () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    expect(
      transitionReviewQueueItem({
        action: "DEFERRED",
        currentStatus: "PENDING",
        deferredUntil: new Date("2026-08-14T00:00:00.000Z"),
        now,
      }).nextStatus,
    ).toBe("DEFERRED");
    expect(() =>
      transitionReviewQueueItem({
        action: "DEFERRED",
        currentStatus: "PENDING",
        deferredUntil: now,
        now,
      }),
    ).toThrow(ValidationError);
  });

  it("makes approved and rejected items terminal", () => {
    expect(() =>
      transitionReviewQueueItem({
        action: "EDITED",
        currentStatus: "APPROVED",
      }),
    ).toThrow(ConflictError);
    expect(() =>
      transitionReviewQueueItem({
        action: "DEFERRED",
        currentStatus: "REJECTED",
      }),
    ).toThrow(ConflictError);
  });

  it.each(["EDITED", "APPROVED", "REJECTED", "DEFERRED"] as const)(
    "builds immutable before/after audit data for %s",
    (action) => {
      const deferredUntil = new Date("2026-08-15T00:00:00.000Z");
      const result = buildAuditedReviewMutation({
        action,
        current: {
          status: "PENDING",
          deferredUntil: null,
          editableDraft: { text: "before" },
        },
        deferredUntil,
        editableDraft: { text: "after" },
        note: "  reviewed  ",
        now: new Date("2026-08-13T00:00:00.000Z"),
      });
      expect(result.audit.before).toMatchObject({ status: "PENDING" });
      expect(result.audit.after).toEqual(result.update);
      expect(result.audit.note).toBe("reviewed");
    },
  );
});
