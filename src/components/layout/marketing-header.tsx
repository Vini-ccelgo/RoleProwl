import { RoleProwlLogo } from "@/components/brand/roleprowl-logo";
import { Button } from "@/components/ui/button";
import { ALL_NAV_ROUTES } from "@/config/routes";
import { NavigationLink } from "@/components/navigation/navigation-link";
import { MobileMenu } from "@/components/navigation/mobile-menu";

export function MarketingHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <RoleProwlLogo />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {ALL_NAV_ROUTES.map((route) => (
            <NavigationLink key={route.href} href={route.href} compact />
          ))}
        </nav>
        <div className="header-actions">
          <Button href="/dashboard" variant="secondary">
            Sign In
          </Button>
          <Button href="/onboarding">Get Started</Button>
        </div>
        <div className="mobile-actions">
          <Button href="/onboarding">Get Started</Button>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
