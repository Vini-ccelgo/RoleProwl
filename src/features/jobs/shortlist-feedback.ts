export const SHORTLIST_CONFIRMATION_MS = 7_000;

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
