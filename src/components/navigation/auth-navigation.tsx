import { Show, UserButton } from "@clerk/nextjs";
import { MobileMenu } from "@/components/navigation/mobile-menu";
import { Button } from "@/components/ui/button";
import { isClerkConfigured } from "@/lib/auth/config";

function SignedOutActions() {
  return (
    <>
      <Button href="/sign-in" variant="secondary">
        Sign In
      </Button>
      <Button href="/sign-up">Get Started</Button>
    </>
  );
}

type AuthNavigationProps = {
  readonly privateBetaRestricted: boolean;
  readonly workspaceAvailable: boolean;
};

export function AuthNavigation({
  privateBetaRestricted,
  workspaceAvailable,
}: AuthNavigationProps) {
  if (!isClerkConfigured()) {
    return (
      <div className="header-actions">
        <SignedOutActions />
      </div>
    );
  }

  return (
    <div className="header-actions">
      <Show when="signed-out">
        <SignedOutActions />
      </Show>
      <Show when="signed-in">
        {workspaceAvailable && (
          <Button href="/dashboard" variant="secondary">
            Dashboard
          </Button>
        )}
        {privateBetaRestricted && (
          <span className="text-sm text-foreground-muted">
            Private beta access unavailable
          </span>
        )}
        <UserButton />
      </Show>
    </div>
  );
}

export function MobileAuthNavigation({
  privateBetaRestricted,
  workspaceAvailable,
}: AuthNavigationProps) {
  const configured = isClerkConfigured();
  return (
    <div className="mobile-actions">
      {!configured && <Button href="/onboarding">Get Started</Button>}
      {configured && (
        <>
          <Show when="signed-out">
            <Button href="/onboarding">Get Started</Button>
          </Show>
          <Show when="signed-in">
            {workspaceAvailable && (
              <Button href="/dashboard" variant="secondary">
                Workspace
              </Button>
            )}
            {privateBetaRestricted && (
              <span className="sr-only">Private beta access unavailable</span>
            )}
          </Show>
        </>
      )}
      <MobileMenu />
    </div>
  );
}
