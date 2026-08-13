import Link from "next/link";
import { cn } from "@/lib/cn";

export function RoleProwlMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-10", className)}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M13.2 22.2c-2.8.1-5.1-2.2-5.1-5s2-4.8 4.6-4.8 4.9 2.3 5 5.1c.1 2.6-1.9 4.6-4.5 4.7Zm10-8.5c-2.9 0-5.2-2.6-5.2-5.6S20.1 3 23 3s5.2 2.5 5.2 5.5-2.2 5.2-5 5.2Zm11.2 6.6c-2.7 0-4.8-2.2-4.8-5s2.1-5.2 4.8-5.2 4.8 2.3 4.8 5.1-2.1 5-4.8 5.1Zm-17 3.9c2.2-3.2 4.1-5.2 7.1-5.2 3.5 0 5.5 2.7 8 5.7 2.3 2.8 5.2 5.8 4 10.2-1.1 4.1-5.2 5.1-8.2 4.2-2.8-.8-4.4-.8-7.3.2-3.4 1.1-7.8-.6-8.5-4.8-.7-3.9 2.5-6.9 4.9-10.3Z"
      />
      <circle cx="7" cy="28" r="2.2" fill="var(--color-brand-accent)" />
      <circle cx="3" cy="35" r="1.3" fill="var(--color-brand-accent)" />
    </svg>
  );
}

export function RoleProwlLogo({
  inverse = false,
  linked = true,
}: {
  inverse?: boolean;
  linked?: boolean;
}) {
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xl font-bold tracking-tight",
        inverse && "text-white",
      )}
    >
      <RoleProwlMark className={inverse ? "text-white" : "text-foreground"} />
      <span>
        Role<span className="text-brand-accent">Prowl</span>
      </span>
    </span>
  );
  return linked ? (
    <Link href="/" aria-label="RoleProwl home">
      {content}
    </Link>
  ) : (
    content
  );
}
