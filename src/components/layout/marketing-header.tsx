import { RoleProwlLogo } from "@/components/brand/roleprowl-logo";
import { AuthNavigation } from "@/components/navigation/auth-navigation";
import { Button } from "@/components/ui/button";
import { MARKETING_NAV_ROUTES } from "@/config/routes";
import { NavigationLink } from "@/components/navigation/navigation-link";
import { MobileMenu } from "@/components/navigation/mobile-menu";

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
        <div className="mobile-actions">
          <Button href="/onboarding">Get Started</Button>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
