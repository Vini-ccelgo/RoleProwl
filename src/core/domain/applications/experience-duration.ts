export interface DatedExperienceInterval {
  readonly id: string;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly isCurrent?: boolean;
}

export interface ExperienceDurationResult {
  readonly months: number;
  readonly includedIds: readonly string[];
  readonly invalidIds: readonly string[];
}

function monthIndex(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.getUTCFullYear() * 12 + parsed.getUTCMonth()
    : null;
}

export function unionExperienceDurationMonths(input: {
  readonly experiences: readonly DatedExperienceInterval[];
  readonly now?: Date;
  readonly selectedIds?: readonly string[];
}): ExperienceDurationResult {
  const now = input.now ?? new Date();
  const nowMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const selected = input.selectedIds ? new Set(input.selectedIds) : null;
  const seen = new Set<string>();
  const invalidIds: string[] = [];
  const includedIds: string[] = [];
  const intervals: { start: number; end: number }[] = [];

  for (const experience of input.experiences) {
    if (selected && !selected.has(experience.id)) continue;
    if (seen.has(experience.id)) continue;
    seen.add(experience.id);
    const start = monthIndex(experience.startDate);
    const suppliedEnd = monthIndex(experience.endDate);
    const end = experience.isCurrent
      ? nowMonth
      : suppliedEnd == null
        ? null
        : Math.min(suppliedEnd, nowMonth);
    if (start == null || end == null || start >= nowMonth || end <= start) {
      invalidIds.push(experience.id);
      continue;
    }
    includedIds.push(experience.id);
    intervals.push({ start, end });
  }

  intervals.sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  let months = 0;
  let active: { start: number; end: number } | null = null;
  for (const interval of intervals) {
    if (!active) {
      active = { ...interval };
      continue;
    }
    if (interval.start <= active.end) {
      active.end = Math.max(active.end, interval.end);
      continue;
    }
    months += active.end - active.start;
    active = { ...interval };
  }
  if (active) months += active.end - active.start;

  return { months, includedIds, invalidIds };
}

export function completedExperienceYears(months: number) {
  return Math.floor(Math.max(0, months) / 12);
}

export function formattedExperienceDuration(months: number) {
  const years = Math.max(0, months) / 12;
  const value = Number.isInteger(years) ? String(years) : years.toFixed(1);
  return `${value} ${years === 1 ? "year" : "years"}`;
}
