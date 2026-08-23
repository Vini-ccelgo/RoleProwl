import {
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  House,
  LayoutDashboard,
  Bell,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type AppRoute = { href: string; label: string; icon: LucideIcon };

export const HOME_ROUTE = {
  href: "/",
  label: "Home",
  icon: House,
} satisfies AppRoute;
export const APP_ROUTES = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/onboarding", label: "Onboarding", icon: FileText },
  { href: "/profile", label: "Career Profile", icon: UserRound },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/queue", label: "Queue", icon: ClipboardList },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
] as const satisfies readonly AppRoute[];

export const LEGAL_ROUTES = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/security", label: "Security" },
] as const;

export const ALL_NAV_ROUTES = [HOME_ROUTE, ...APP_ROUTES] as const;
export const MARKETING_NAV_ROUTES = ALL_NAV_ROUTES.filter(
  (route) => route.href !== "/dashboard",
);

export function routeForPath(pathname: string): AppRoute | undefined {
  return ALL_NAV_ROUTES.find((route) => route.href === pathname);
}
