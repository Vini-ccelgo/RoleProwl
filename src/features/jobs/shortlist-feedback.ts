export const SHORTLIST_CONFIRMATION_MS = 15_000;

export function scheduleShortlistRefresh(
  refresh: () => void,
  delay = SHORTLIST_CONFIRMATION_MS,
) {
  const timer = setTimeout(refresh, delay);
  return () => clearTimeout(timer);
}

export function showViewShortlistLink(
  view: "active" | "all" | "rejected" | "shortlisted",
  transient: boolean,
) {
  return view !== "shortlisted" && !transient;
}

export function shortlistRemovalLabel(transient: boolean) {
  return transient ? "Undo" : "Remove from shortlist";
}

export type PendingDisposition =
  "REJECTED" | "SHORTLISTED" | "UNDECIDED" | null;

export function dispositionActionIsPending(
  status: Exclude<PendingDisposition, null>,
  pendingDisposition: PendingDisposition,
) {
  if (status === "UNDECIDED" && pendingDisposition === "SHORTLISTED")
    return false;
  return pendingDisposition !== null;
}
