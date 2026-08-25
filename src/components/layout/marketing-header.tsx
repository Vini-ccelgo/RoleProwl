import { RoleProwlLogo } from "@/components/brand/roleprowl-logo";
import {
  AuthNavigation,
  MobileAuthNavigation,
} from "@/components/navigation/auth-navigation";
import { MARKETING_NAV_ROUTES } from "@/config/routes";
import { NavigationLink } from "@/components/navigation/navigation-link";
import { resolveWorkspaceAdmission } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";

export async function MarketingHeader() {
  const admission = await resolveWorkspaceAdmission(currentAuthProvider());
  const workspaceAvailable = admission.status === "ALLOWED";
  const privateBetaRestricted = admission.status === "PRIVATE_BETA_DENIED";
  return (
    <header className="site-header">
      <div className="header-inner">
        <RoleProwlLogo />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {MARKETING_NAV_ROUTES.map((route) => (
            <NavigationLink key={route.href} href={route.href} compact />
          ))}
        </nav>
        <AuthNavigation
          privateBetaRestricted={privateBetaRestricted}
          workspaceAvailable={workspaceAvailable}
        />
        <MobileAuthNavigation
          privateBetaRestricted={privateBetaRestricted}
          workspaceAvailable={workspaceAvailable}
        />
      </div>
    </header>
  );
}
