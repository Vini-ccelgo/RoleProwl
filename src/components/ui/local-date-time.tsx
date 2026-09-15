"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

export function formatLocalDateTime(
  value: string | Date,
  options: { readonly locale?: string; readonly timeZone?: string } = {},
) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: "short",
    timeStyle: "medium",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);
}

export function LocalDateTime({ value }: { readonly value: string | Date }) {
  const iso = (value instanceof Date ? value : new Date(value)).toISOString();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <time dateTime={iso}>{hydrated ? formatLocalDateTime(iso) : iso}</time>
  );
}
