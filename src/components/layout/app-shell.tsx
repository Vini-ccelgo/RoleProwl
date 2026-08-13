import { RoleProwlLogo } from "@/components/brand/roleprowl-logo";
import { APP_ROUTES, HOME_ROUTE } from "@/config/routes";
import { NavigationLink } from "@/components/navigation/navigation-link";
import { MobileMenu } from "@/components/navigation/mobile-menu";

export function AppShell({ children }: { children: React.ReactNode }) {
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
        <div className="sidebar-note">
          <strong>Foundation mode</strong>
          <p>App routes are temporarily unprotected until RP-002.</p>
        </div>
      </aside>
      <header className="app-mobile-header">
        <RoleProwlLogo />
        <MobileMenu />
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
