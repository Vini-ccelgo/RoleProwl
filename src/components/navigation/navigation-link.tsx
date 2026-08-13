"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ALL_NAV_ROUTES } from "@/config/routes";
import { cn } from "@/lib/cn";
export function NavigationLink({
  href,
  compact = false,
  onClick,
}: {
  href: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const route = ALL_NAV_ROUTES.find((item) => item.href === href);
  if (!route) return null;
  const Icon = route.icon;
  const active = pathname === route.href;
  return (
    <Link
      href={route.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn("nav-link", active && "active", compact && "compact")}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{route.label}</span>
    </Link>
  );
}
