import { NotFoundError } from "@/core/errors/application-errors";

export type CandidateJobDisposition = "SHORTLISTED" | "REJECTED";
export type JobDispositionView = "active" | "shortlisted" | "rejected" | "all";

export const JOB_DISPOSITION_FILTERS = [
  ["active", "Active"],
  ["shortlisted", "Shortlisted"],
  ["rejected", "Rejected by you"],
] as const;

export function parseJobDispositionView(value: string | undefined) {
  return value === "shortlisted" || value === "rejected" ? value : "active";
}

export function jobIsVisibleInDispositionView(
  disposition: CandidateJobDisposition | null,
  view: JobDispositionView,
) {
  if (view === "shortlisted") return disposition === "SHORTLISTED";
  if (view === "rejected") return disposition === "REJECTED";
  if (view === "all") return true;
  return disposition !== "REJECTED";
}

export function candidateDispositionLabel(
  disposition: CandidateJobDisposition | null,
) {
  if (disposition === "SHORTLISTED") return "Shortlisted";
  if (disposition === "REJECTED") return "Rejected by you";
  return "Undecided";
}

export function requireOwnedJobDisposition<T extends { userId: string }>(
  disposition: T | null,
  userId: string,
): T {
  if (!disposition || disposition.userId !== userId) throw new NotFoundError();
  return disposition;
}
