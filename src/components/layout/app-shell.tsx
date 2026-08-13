import { RoleProwlLogo } from "@/components/brand/roleprowl-logo";
import { APP_ROUTES, HOME_ROUTE } from "@/config/routes";
import { NavigationLink } from "@/components/navigation/navigation-link";
import { MobileMenu } from "@/components/navigation/mobile-menu";
import { UserButton } from "@clerk/nextjs";
import type { AuthenticatedActor } from "@/core/contracts";
import { isClerkConfigured } from "@/lib/auth/config";

export function AppShell({
  actor,
  children,
}: {
  actor: AuthenticatedActor;
  children: React.ReactNode;
}) {
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <RoleProwlLogo />
        <nav aria-label="Application navigation">
          <NavigationLink href={HOME_ROUTE.href} />
          {APP_ROUTES.map((route) => (
            <NavigationLink key={route.href} href={route.href} />
          ))}
        </nav>
        <div className="sidebar-account">
          {isClerkConfigured() && <UserButton />}
          <span>
            <strong>Signed in</strong>
            <small>{actor.email ?? "Authenticated account"}</small>
          </span>
        </div>
      </aside>
      <header className="app-mobile-header">
        <RoleProwlLogo />
        <div className="app-mobile-actions">
          {isClerkConfigured() && <UserButton />}
          <MobileMenu />
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
