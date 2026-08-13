import type { Prisma } from "@/generated/prisma/client";

const REDACTED_KEYS = new Set([
  "storageKey",
  "secret",
  "token",
  "apiKey",
  "password",
]);

function display(value: Prisma.JsonValue, depth = 0): React.ReactNode {
  if (value === null)
    return <span className="text-foreground-muted">Unknown</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "object") return String(value);
  if (depth > 5)
    return <span className="text-foreground-muted">Nested data retained</span>;
  if (Array.isArray(value)) {
    if (value.length === 0)
      return <span className="text-foreground-muted">None recorded</span>;
    return (
      <ol className="m-0 grid gap-2 pl-5">
        {value.map((item, index) => (
          <li key={index}>{display(item, depth + 1)}</li>
        ))}
      </ol>
    );
  }
  const entries = Object.entries(value).filter(
    ([key]) => !REDACTED_KEYS.has(key),
  );
  if (entries.length === 0)
    return <span className="text-foreground-muted">None recorded</span>;
  return (
    <dl className="m-0 grid gap-2">
      {entries.map(([key, item]) => (
        <div className="grid gap-1 sm:grid-cols-[12rem_1fr]" key={key}>
          <dt className="font-semibold">{key.replaceAll("_", " ")}</dt>
          <dd className="m-0 min-w-0 break-words">
            {item === undefined ? "Unknown" : display(item, depth + 1)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonSnapshot({ value }: { value: Prisma.JsonValue }) {
  return <div className="text-sm leading-6">{display(value)}</div>;
}
