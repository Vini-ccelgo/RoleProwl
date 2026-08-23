import { RoleProwlLogo } from "@/components/brand/roleprowl-logo";
import {
  AuthNavigation,
  MobileAuthNavigation,
} from "@/components/navigation/auth-navigation";
import { MARKETING_NAV_ROUTES } from "@/config/routes";
import { NavigationLink } from "@/components/navigation/navigation-link";

export function MarketingHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <RoleProwlLogo />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {MARKETING_NAV_ROUTES.map((route) => (
            <NavigationLink key={route.href} href={route.href} compact />
          ))}
        </nav>
        <AuthNavigation />
        <MobileAuthNavigation />
      </div>
    </header>
  );
}
