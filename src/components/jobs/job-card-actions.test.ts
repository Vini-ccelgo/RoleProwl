import { afterEach, describe, expect, it, vi } from "vitest";
import {
  scheduleShortlistRefresh,
  showViewShortlistLink,
  shortlistRemovalLabel,
  SHORTLIST_CONFIRMATION_MS,
} from "@/features/jobs/shortlist-feedback";

describe("shortlist confirmation timer", () => {
  afterEach(() => vi.useRealTimers());

  it("refreshes after the bounded confirmation period", () => {
    expect(SHORTLIST_CONFIRMATION_MS).toBe(15_000);
    vi.useFakeTimers();
    const refresh = vi.fn();
    scheduleShortlistRefresh(refresh);
    vi.advanceTimersByTime(SHORTLIST_CONFIRMATION_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("cleans up its timer without a stale refresh", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const cleanup = scheduleShortlistRefresh(refresh);
    cleanup();
    vi.advanceTimersByTime(SHORTLIST_CONFIRMATION_MS);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("suppresses redundant shortlist navigation in the shortlisted view", () => {
    expect(showViewShortlistLink("shortlisted", false)).toBe(false);
    expect(showViewShortlistLink("all", false)).toBe(true);
    expect(showViewShortlistLink("active", true)).toBe(false);
  });

  it("offers Undo during transient confirmation", () => {
    expect(shortlistRemovalLabel(true)).toBe("Undo");
    expect(shortlistRemovalLabel(false)).toBe("Remove from shortlist");
  });
});
